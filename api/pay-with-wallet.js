const admin = require('firebase-admin');
const crypto = require('crypto');

const APP_ID = process.env.DRIVE_MX_APP_ID || 'saxrecords-appcreat';
const ADMIN_EMAIL = 'admin@drivemx.com';
const MAX_PRODUCTS = 40;
const MAX_REQUEST_BYTES = 600000;
const GENERAL_SHIPPING_FEE = 150;
const DEFAULT_CASHBACK_AMOUNT = 10;
const MAX_MONEY = 20000000;

function clean(value) {
  return String(value ?? '').trim();
}

function safeDocId(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function fold(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function publicError(message, statusCode = 400, code = 'invalid-request', details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(String(req.body || '{}'));
  } catch (error) {
    throw publicError('La información enviada no es válida.', 400, 'invalid-json');
  }
}

function parseServiceAccountFromEnv() {
  const rawJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (jsonError) {
      try {
        parsed = JSON.parse(Buffer.from(rawJson, 'base64').toString('utf8'));
      } catch (base64Error) {
        throw publicError(
          'Firebase Admin no tiene credenciales válidas en Vercel.',
          500,
          'firebase-admin-invalid-credentials'
        );
      }
    }
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || APP_ID
    });
  }
  return admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || APP_ID });
}

function normalizeCredentialError(error) {
  const code = clean(error?.code).toLowerCase();
  const message = clean(error?.message).toLowerCase();
  const credentialFailure =
    code.includes('credential') ||
    code.includes('app/invalid') ||
    message.includes('credential') ||
    message.includes('service account') ||
    message.includes('default credentials') ||
    message.includes('could not load the default credentials');

  if (credentialFailure) {
    return publicError(
      'Firebase Admin no está configurado correctamente en Vercel.',
      500,
      'firebase-admin-not-configured'
    );
  }
  return error;
}

function dataRoot(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

function requiredText(value, field, maxLength) {
  const text = clean(value);
  if (!text) throw publicError(`Falta el campo ${field}.`, 400, 'missing-field', { field });
  if (text.length > maxLength) {
    throw publicError(`El campo ${field} es demasiado largo.`, 400, 'field-too-long', { field });
  }
  return text;
}

function optionalText(value, maxLength) {
  return clean(value).slice(0, maxLength);
}

function finiteNumber(value, field, { min = 0, max = MAX_MONEY } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw publicError(`El campo ${field} no es válido.`, 400, 'invalid-number', { field });
  }
  return number;
}

function getBearerToken(req) {
  const header = clean(req.headers?.authorization || req.headers?.Authorization);
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw publicError('Inicia sesión nuevamente en la cartera.', 401, 'wallet-auth-required');
  return match[1].trim();
}

function validatePaymentId(paymentId) {
  if (!/^WP-\d{10,}-[A-Z0-9]{6}$/.test(paymentId)) {
    throw publicError('El identificador del pago no es válido.', 400, 'invalid-payment-id');
  }
  return paymentId;
}

function createRequestFingerprint({ requestedProducts = [], delivery = {}, clientTotal = 0 } = {}) {
  const normalizedProducts = requestedProducts
    .map((product) => ({
      id: clean(product.id),
      quantity: Math.floor(Number(product.quantity || 0)),
      sizes: Array.isArray(product.sizes) ? product.sizes.map(clean) : [],
      colors: Array.isArray(product.colors) ? product.colors.map(clean) : []
    }))
    .sort((left, right) => left.id.localeCompare(right.id, 'es'));
  const source = JSON.stringify({
    products: normalizedProducts,
    delivery: {
      street: clean(delivery.street),
      state: clean(delivery.state),
      municipality: clean(delivery.municipality),
      neighborhood: clean(delivery.neighborhood),
      zip: clean(delivery.zip),
      fullName: clean(delivery.fullName),
      phone: clean(delivery.phone),
      email: clean(delivery.email).toLowerCase(),
      references: clean(delivery.references)
    },
    total: roundMoney(clientTotal)
  });
  return crypto.createHash('sha256').update(source).digest('hex');
}

function normalizeDelivery(delivery = {}) {
  const normalized = {
    street: requiredText(delivery.street, 'calle', 240),
    state: requiredText(delivery.state, 'estado', 120),
    municipality: requiredText(delivery.municipality, 'municipio', 140),
    neighborhood: requiredText(delivery.neighborhood, 'colonia', 180),
    zip: requiredText(delivery.zip, 'código postal', 25),
    fullName: requiredText(delivery.fullName, 'nombre completo', 180),
    phone: requiredText(delivery.phone, 'teléfono', 60),
    email: requiredText(delivery.email, 'correo electrónico', 254).toLowerCase(),
    references: requiredText(delivery.references, 'referencias del domicilio', 1200)
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw publicError('El correo electrónico no es válido.', 400, 'invalid-email');
  }
  return normalized;
}

function normalizeRequestedProducts(order = {}) {
  const products = Array.isArray(order.products) ? order.products : [];
  if (products.length < 1 || products.length > MAX_PRODUCTS) {
    throw publicError(`La compra debe contener entre 1 y ${MAX_PRODUCTS} productos distintos.`, 400, 'invalid-products-count');
  }

  const ids = new Set();
  return products.map((product, index) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      throw publicError(`El producto ${index + 1} no es válido.`, 400, 'invalid-product');
    }
    const id = requiredText(product.id, `ID del producto ${index + 1}`, 180);
    if (id.includes('/')) throw publicError('Uno de los productos contiene un ID no válido.', 400, 'invalid-product-id');
    if (ids.has(id)) throw publicError('No se permiten productos duplicados en el pedido.', 400, 'duplicate-product-id', { productId: id });
    ids.add(id);
    const quantity = Math.floor(finiteNumber(
      product.quantity ?? product.productQuantity,
      `cantidad del producto ${index + 1}`,
      { min: 1, max: 1000000 }
    ));
    return {
      id,
      quantity,
      sizes: Array.isArray(product.sizes) ? product.sizes.map((item) => optionalText(item, 80)).filter(Boolean).slice(0, 50) : [],
      colors: Array.isArray(product.colors) ? product.colors.map((item) => optionalText(item, 80)).filter(Boolean).slice(0, 50) : []
    };
  });
}

function isProfileBlocked(profile = {}) {
  return profile.active === false
    || profile.blocked === true
    || ['bloqueado', 'inactivo'].includes(fold(profile.accountStatus));
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
    throw publicError(`El precio de ${clean(product.name) || 'un producto'} no es válido.`, 409, 'product-price-invalid', { productId: clean(product.id) });
  }
  return roundMoney(price);
}

function hasOwn(source, field) {
  return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, field));
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

function normalizeWallet(snapshot, fallbackUser = {}) {
  const data = snapshot?.exists ? snapshot.data() : {};
  const id = snapshot?.id || safeDocId(fallbackUser.uid || fallbackUser.id || '');
  const totalRecharged = roundMoney(data.totalRecharged || 0);
  const rechargeCount = Math.max(0, Number(data.rechargeCount || 0));
  const activated = data.activated === true
    || data.firstRechargeCompleted === true
    || rechargeCount > 0
    || totalRecharged >= 100;
  return {
    ...data,
    id,
    uid: clean(data.uid || data.userId || id),
    userId: clean(data.userId || data.uid || id),
    userName: clean(data.userName || fallbackUser.name || fallbackUser.email || 'Usuario'),
    userEmail: clean(data.userEmail || fallbackUser.email || '').toLowerCase(),
    userPhone: clean(data.userPhone || fallbackUser.phone || ''),
    currency: 'MXN',
    balance: roundMoney(data.balance || 0),
    activated,
    firstRechargeCompleted: data.firstRechargeCompleted === true || activated,
    rechargeCount,
    totalRecharged,
    totalCommissions: roundMoney(data.totalCommissions || 0),
    totalPurchases: roundMoney(data.totalPurchases || 0),
    totalCashback: roundMoney(data.totalCashback || 0),
    createdAt: Number(data.createdAt || Date.now()),
    updatedAt: Number(data.updatedAt || Date.now())
  };
}

async function getSnapshotMap(transaction, refs = []) {
  const unique = [];
  const seen = new Set();
  refs.forEach((ref) => {
    if (!ref?.path || seen.has(ref.path)) return;
    seen.add(ref.path);
    unique.push(ref);
  });
  if (!unique.length) return new Map();
  const snapshots = await transaction.getAll(...unique);
  return new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
}

function createMovementBase({ id, walletId, wallet, type, direction, concept, amount, balanceBefore, balanceAfter, createdAt, buyerEmail, paymentId } = {}) {
  return {
    id,
    movementId: id,
    walletId,
    userId: walletId,
    userName: clean(wallet.userName || 'Usuario'),
    userEmail: clean(wallet.userEmail || buyerEmail || '').toLowerCase(),
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
    createdBy: clean(buyerEmail || 'wallet-payment-api')
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, code: 'method-not-allowed', error: 'Método no permitido.' });
  }

  try {
    const contentLength = Number(req.headers?.['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw publicError('El pedido supera el tamaño permitido.', 413, 'payload-too-large');
    }

    const body = parseBody(req);
    const serializedLength = Buffer.byteLength(JSON.stringify(body || {}), 'utf8');
    if (serializedLength > MAX_REQUEST_BYTES) {
      throw publicError('El pedido supera el tamaño permitido.', 413, 'payload-too-large');
    }

    const paymentId = validatePaymentId(clean(body.paymentId));
    const order = body.order && typeof body.order === 'object' && !Array.isArray(body.order) ? body.order : {};
    const requestedProducts = normalizeRequestedProducts(order);
    const delivery = normalizeDelivery(order.delivery || {});
    const clientTotal = finiteNumber(order.cart?.total, 'total del pedido', { min: 0, max: MAX_MONEY });
    const requestFingerprint = createRequestFingerprint({ requestedProducts, delivery, clientTotal });
    const token = getBearerToken(req);

    let app;
    try {
      app = getAdminApp();
    } catch (error) {
      throw normalizeCredentialError(error);
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth(app).verifyIdToken(token);
    } catch (error) {
      throw publicError('El usuario o la contraseña de la cartera dejaron de ser válidos.', 401, 'wallet-auth-invalid');
    }

    const buyerId = clean(decodedToken.uid);
    const buyerTokenEmail = clean(decodedToken.email).toLowerCase();
    if (!buyerId || !buyerTokenEmail) {
      throw publicError('No se pudo identificar al usuario de la cartera.', 401, 'wallet-user-invalid');
    }

    const db = admin.firestore(app);
    const root = dataRoot(db);
    const paymentRef = root.collection('wallet_payments').doc(paymentId);
    const buyerProfileRef = root.collection('operators').doc(safeDocId(buyerId));
    const buyerWalletRef = root.collection('wallets').doc(safeDocId(buyerId));
    const walletSettingsRef = root.collection('wallet_settings').doc('config');
    const supermarketSettingsRef = root.collection('supermarket_settings').doc('config');

    const result = await db.runTransaction(async (transaction) => {
      const existingPaymentSnapshot = await transaction.get(paymentRef);
      if (existingPaymentSnapshot.exists) {
        const existing = existingPaymentSnapshot.data() || {};
        if (clean(existing.buyerId) !== buyerId) {
          throw publicError('El identificador del pago ya fue utilizado.', 409, 'payment-id-already-used');
        }
        if (clean(existing.requestFingerprint) && clean(existing.requestFingerprint) !== requestFingerprint) {
          throw publicError('El identificador pertenece a otra compra. Regresa al carrito e intenta nuevamente.', 409, 'payment-id-order-mismatch');
        }
        if (fold(existing.status) !== 'pagado' || !existing.clientResult) {
          throw publicError('El pago anterior no terminó correctamente.', 409, 'payment-id-incomplete');
        }
        const existingResult = existing.clientResult || {};
        return { ...existingResult, idempotent: true };
      }

      const baseSnapshotMap = await getSnapshotMap(transaction, [
        buyerProfileRef,
        buyerWalletRef,
        walletSettingsRef,
        supermarketSettingsRef
      ]);
      const buyerProfileSnapshot = baseSnapshotMap.get(buyerProfileRef.path);
      const buyerWalletSnapshot = baseSnapshotMap.get(buyerWalletRef.path);
      const walletSettingsSnapshot = baseSnapshotMap.get(walletSettingsRef.path);
      const supermarketSettingsSnapshot = baseSnapshotMap.get(supermarketSettingsRef.path);

      if (!buyerProfileSnapshot.exists) {
        throw publicError('La cuenta de la cartera no existe.', 403, 'wallet-profile-not-found');
      }
      const buyerProfile = { id: buyerProfileSnapshot.id, ...buyerProfileSnapshot.data() };
      if (buyerProfile.role === 'admin' || isProfileBlocked(buyerProfile)) {
        throw publicError('La cuenta no está disponible para pagar con cartera.', 403, 'wallet-account-not-available');
      }
      const profileEmail = clean(buyerProfile.email).toLowerCase();
      if (profileEmail && profileEmail !== buyerTokenEmail) {
        throw publicError('La cuenta de la cartera no coincide con el usuario validado.', 403, 'wallet-profile-mismatch');
      }
      if (!buyerWalletSnapshot.exists) {
        throw publicError('La cartera todavía no tiene saldo disponible.', 409, 'wallet-not-found');
      }

      const productRefs = requestedProducts.map((item) => root.collection('products').doc(item.id));
      const productSnapshotMap = await getSnapshotMap(transaction, productRefs);
      const liveItems = requestedProducts.map((requested) => {
        const productRef = root.collection('products').doc(requested.id);
        const snapshot = productSnapshotMap.get(productRef.path);
        if (!snapshot?.exists) {
          throw publicError('Uno de los productos ya no está disponible.', 409, 'product-not-found', { productId: requested.id });
        }
        const product = { id: snapshot.id, ...snapshot.data() };
        if (product.active === false) {
          throw publicError(`${clean(product.name) || 'Un producto'} ya no está activo.`, 409, 'product-not-active', { productId: requested.id });
        }
        const stock = getProductStock(product);
        if (stock < requested.quantity) {
          throw publicError(
            `Inventario insuficiente para ${clean(product.name) || requested.id}.`,
            409,
            'product-stock-insufficient',
            { productId: requested.id, availableStock: stock, requestedQuantity: requested.quantity }
          );
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
      if (driveMxCount > 2) {
        throw publicError('Productos Drive MX permiten máximo 2 productos distintos por compra.', 400, 'drive-mx-product-limit');
      }
      if (supermarketCount > 0 && supermarketCount < 5) {
        throw publicError('La compra de Supermercado requiere mínimo 5 productos distintos.', 400, 'supermarket-minimum-products');
      }

      const walletSettings = walletSettingsSnapshot.exists ? walletSettingsSnapshot.data() || {} : {};
      const supermarketSettings = supermarketSettingsSnapshot.exists ? supermarketSettingsSnapshot.data() || {} : {};
      const commissionPercent = roundMoney(clampNumber(walletSettings.globalCommissionPercent, 0, 100, 0));
      const cashbackAmount = roundMoney(clampNumber(
        walletSettings.globalCashbackAmount ?? walletSettings.cashbackAmount,
        0,
        1000000,
        DEFAULT_CASHBACK_AMOUNT
      ));
      const supermarketFallback = normalizeShippingFee(supermarketSettings.shippingFee, GENERAL_SHIPPING_FEE);
      const subtotal = roundMoney(liveItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const shippingFee = calculateShippingFee(liveItems, supermarketFallback);
      const total = roundMoney(subtotal + shippingFee);
      const totalQuantity = liveItems.reduce((sum, item) => sum + item.requested.quantity, 0);

      if (total <= 0) {
        throw publicError('El total de la compra debe ser mayor a $0.00.', 400, 'wallet-total-zero');
      }
      if (Math.abs(total - roundMoney(clientTotal)) > 0.01) {
        throw publicError(
          'El total de la compra cambió. Regresa al carrito y revisa los importes.',
          409,
          'order-total-changed',
          { clientTotal: roundMoney(clientTotal), currentTotal: total }
        );
      }

      const ownerIds = Array.from(new Set(liveItems
        .filter((item) => item.userPublication && item.ownerId)
        .map((item) => safeDocId(item.ownerId))
        .filter(Boolean)));
      const ownerProfileRefs = ownerIds.map((ownerId) => root.collection('operators').doc(ownerId));
      const ownerWalletRefs = ownerIds.map((ownerId) => root.collection('wallets').doc(ownerId));
      const adminMirrorRefs = liveItems.map((item) => root.collection('admin_products').doc(item.product.id));
      const userMirrorRefs = liveItems
        .filter((item) => item.userPublication && item.ownerId)
        .map((item) => root.collection('user_products').doc(safeDocId(item.ownerId)).collection('items').doc(item.product.id));

      const relatedSnapshotMap = await getSnapshotMap(transaction, [
        ...ownerProfileRefs,
        ...ownerWalletRefs,
        ...adminMirrorRefs,
        ...userMirrorRefs
      ]);
      const ownerProfileMap = relatedSnapshotMap;
      const ownerWalletMap = relatedSnapshotMap;
      const adminMirrorMap = relatedSnapshotMap;
      const userMirrorMap = relatedSnapshotMap;

      const buyerWallet = normalizeWallet(buyerWalletSnapshot, {
        uid: buyerId,
        name: buyerProfile.name,
        email: buyerProfile.email,
        phone: buyerProfile.phone
      });
      if (!buyerWallet.activated || !buyerWallet.firstRechargeCompleted) {
        throw publicError('La cartera no está activa.', 409, 'wallet-not-active');
      }
      if (buyerWallet.balance < total) {
        throw publicError(
          'Saldo insuficiente en la cartera.',
          409,
          'wallet-insufficient-funds',
          { availableBalance: buyerWallet.balance, requiredAmount: total }
        );
      }

      const walletStates = new Map();
      walletStates.set(safeDocId(buyerId), {
        ref: buyerWalletRef,
        wallet: buyerWallet,
        currentBalance: buyerWallet.balance,
        changed: false
      });

      ownerIds.forEach((ownerId) => {
        if (walletStates.has(ownerId)) return;
        const walletRef = root.collection('wallets').doc(ownerId);
        const snapshot = ownerWalletMap.get(walletRef.path);
        const profileRef = root.collection('operators').doc(ownerId);
        const profileSnapshot = ownerProfileMap.get(profileRef.path);
        const profile = profileSnapshot?.exists ? { id: profileSnapshot.id, ...profileSnapshot.data() } : {};
        if (!snapshot?.exists) {
          throw publicError('No se encontró la cartera de uno de los vendedores.', 409, 'seller-wallet-not-found', { sellerId: ownerId });
        }
        const wallet = normalizeWallet(snapshot, profile);
        if (!wallet.activated || !wallet.firstRechargeCompleted) {
          throw publicError('La cartera de uno de los vendedores no está activa.', 409, 'seller-wallet-not-active', { sellerId: ownerId });
        }
        walletStates.set(ownerId, { ref: walletRef, wallet, currentBalance: wallet.balance, changed: false });
      });

      const now = Date.now();
      const buyerWalletId = safeDocId(buyerId);
      const buyerState = walletStates.get(buyerWalletId);
      const buyerBalanceBefore = buyerState.currentBalance;
      const buyerBalanceAfterCharge = roundMoney(buyerBalanceBefore - total);
      buyerState.currentBalance = buyerBalanceAfterCharge;
      buyerState.changed = true;

      const purchaseMovementId = safeDocId(`mov_purchase_${paymentId}`);
      const purchaseMovement = createMovementBase({
        id: purchaseMovementId,
        walletId: buyerWalletId,
        wallet: buyerState.wallet,
        type: 'purchase',
        direction: 'debit',
        concept: 'Compra pagada con cartera',
        amount: -total,
        balanceBefore: buyerBalanceBefore,
        balanceAfter: buyerBalanceAfterCharge,
        createdAt: now,
        buyerEmail: buyerTokenEmail,
        paymentId
      });

      let cashbackMovement = null;
      if (cashbackAmount > 0) {
        const cashbackBefore = buyerState.currentBalance;
        const cashbackAfter = roundMoney(cashbackBefore + cashbackAmount);
        buyerState.currentBalance = cashbackAfter;
        const cashbackMovementId = safeDocId(`mov_cashback_${paymentId}`);
        cashbackMovement = createMovementBase({
          id: cashbackMovementId,
          walletId: buyerWalletId,
          wallet: buyerState.wallet,
          type: 'cashback',
          direction: 'credit',
          concept: 'Cash Back por compra con cartera',
          amount: cashbackAmount,
          balanceBefore: cashbackBefore,
          balanceAfter: cashbackAfter,
          createdAt: now,
          buyerEmail: buyerTokenEmail,
          paymentId
        });
        cashbackMovement.cashbackAmount = cashbackAmount;
      }

      const commissionResults = new Map();
      liveItems.forEach((item, index) => {
        const saleId = safeDocId(`wallet_${paymentId}_${index + 1}`);
        if (!item.userPublication || !item.ownerId) {
          commissionResults.set(saleId, {
            applies: false,
            amount: 0,
            balanceBefore: null,
            balanceAfter: null,
            percent: commissionPercent
          });
          return;
        }
        const ownerWalletId = safeDocId(item.ownerId);
        const state = walletStates.get(ownerWalletId);
        const commissionAmount = roundMoney((item.lineTotal * commissionPercent) / 100);
        const balanceBefore = state.currentBalance;
        if (commissionAmount > 0 && balanceBefore < commissionAmount) {
          throw publicError(
            'La cartera de uno de los vendedores no tiene saldo suficiente para descontar la comisión.',
            409,
            'seller-wallet-insufficient-funds',
            { sellerId: ownerWalletId, availableBalance: balanceBefore, commissionAmount }
          );
        }
        const balanceAfter = roundMoney(balanceBefore - commissionAmount);
        state.currentBalance = balanceAfter;
        if (commissionAmount > 0) state.changed = true;
        commissionResults.set(saleId, {
          applies: true,
          amount: commissionAmount,
          balanceBefore,
          balanceAfter,
          percent: commissionPercent,
          ownerWalletId
        });
      });

      const sales = [];
      const inventoryUpdates = [];
      const saleIds = [];
      const commissionWrites = [];

      liveItems.forEach((item, index) => {
        const saleId = safeDocId(`wallet_${paymentId}_${index + 1}`);
        const commission = commissionResults.get(saleId);
        const remainingStock = Math.max(0, item.stock - item.requested.quantity);
        const inventoryPatch = {
          stock: remainingStock,
          availableStock: remainingStock,
          updatedAt: now,
          inventoryUpdatedAt: now,
          lastSaleId: saleId,
          lastSoldQuantity: item.requested.quantity
        };

        const ownerDocId = item.userPublication && item.ownerId ? safeDocId(item.ownerId) : '';
        const ownerProfileRef = ownerDocId ? root.collection('operators').doc(ownerDocId) : null;
        const ownerProfileSnapshot = ownerProfileRef ? ownerProfileMap.get(ownerProfileRef.path) : null;
        const ownerProfile = ownerProfileSnapshot?.exists ? { id: ownerProfileSnapshot.id, ...ownerProfileSnapshot.data() } : {};
        const sellerName = clean(ownerProfile.name || item.product.ownerName || (ownerDocId ? 'Usuario' : 'Admin Central'));
        const sellerEmail = clean(ownerProfile.email || item.product.ownerEmail || (ownerDocId ? '' : ADMIN_EMAIL)).toLowerCase();
        const sellerPhone = clean(ownerProfile.phone || item.product.ownerPhone || '-');
        const sellerNotificationEmail = clean(
          ownerProfile.saleNotificationEmail ||
          item.product.saleNotificationEmail ||
          item.product.sellerNotificationEmail ||
          sellerEmail
        ).toLowerCase();

        const sale = {
          saleId,
          orderSaleId: safeDocId(`wallet_${paymentId}`),
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
          buyerName: delivery.fullName,
          buyerEmail: delivery.email,
          buyerPhone: delivery.phone,
          delivery,
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
        saleIds.push(saleId);
        inventoryUpdates.push({ productId: item.product.id, ownerId: ownerDocId, patch: inventoryPatch });

        if (commission.applies && commission.amount > 0) {
          const state = walletStates.get(commission.ownerWalletId);
          const movementId = safeDocId(`mov_commission_${commission.ownerWalletId}_${saleId}`);
          const commissionId = safeDocId(`commission_${commission.ownerWalletId}_${saleId}`);
          const movement = {
            ...createMovementBase({
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
              buyerEmail: buyerTokenEmail,
              paymentId
            }),
            commissionPercent,
            saleId,
            productId: item.product.id,
            productName: sale.productName
          };
          const record = {
            ...movement,
            id: commissionId,
            commissionId,
            movementId,
            status: 'Descontada'
          };
          commissionWrites.push({
            movementRef: root.collection('wallets').doc(commission.ownerWalletId).collection('movements').doc(movementId),
            movement,
            commissionRef: root.collection('wallet_commissions').doc(commissionId),
            record
          });
        }

        transaction.set(item.productRef, inventoryPatch, { merge: true });
        const adminMirrorRef = root.collection('admin_products').doc(item.product.id);
        if (adminMirrorMap.get(adminMirrorRef.path)?.exists) {
          transaction.set(adminMirrorRef, inventoryPatch, { merge: true });
        }
        if (ownerDocId) {
          const userMirrorRef = root.collection('user_products').doc(ownerDocId).collection('items').doc(item.product.id);
          if (userMirrorMap.get(userMirrorRef.path)?.exists) {
            transaction.set(userMirrorRef, inventoryPatch, { merge: true });
          }
        }

        transaction.set(root.collection('completed_sales').doc(saleId), sale);
        if (ownerDocId) {
          transaction.set(root.collection('user_sales').doc(ownerDocId).collection('items').doc(saleId), {
            id: saleId,
            ...sale,
            visibleToUserId: ownerDocId
          });
        }
      });

      transaction.set(
        root.collection('wallets').doc(buyerWalletId).collection('movements').doc(purchaseMovementId),
        purchaseMovement
      );
      if (cashbackMovement) {
        transaction.set(
          root.collection('wallets').doc(buyerWalletId).collection('movements').doc(cashbackMovement.id),
          cashbackMovement
        );
      }
      commissionWrites.forEach((write) => {
        transaction.set(write.movementRef, write.movement);
        transaction.set(write.commissionRef, write.record);
      });

      walletStates.forEach((state, walletId) => {
        if (!state.changed) return;
        const isBuyerWallet = walletId === buyerWalletId;
        const nextWallet = {
          ...state.wallet,
          balance: roundMoney(state.currentBalance),
          totalPurchases: roundMoney(Number(state.wallet.totalPurchases || 0) + (isBuyerWallet ? total : 0)),
          totalCashback: roundMoney(Number(state.wallet.totalCashback || 0) + (isBuyerWallet ? cashbackAmount : 0)),
          totalCommissions: roundMoney(Number(state.wallet.totalCommissions || 0) + commissionWrites
            .filter((write) => write.record.walletId === walletId)
            .reduce((sum, write) => sum + Number(write.record.absoluteAmount || 0), 0)),
          lastPurchaseAt: isBuyerWallet ? now : (state.wallet.lastPurchaseAt || null),
          lastCashbackAt: isBuyerWallet && cashbackAmount > 0 ? now : (state.wallet.lastCashbackAt || null),
          lastCommissionAt: commissionWrites.some((write) => write.record.walletId === walletId) ? now : (state.wallet.lastCommissionAt || null),
          updatedAt: now,
          updatedBy: buyerTokenEmail,
          status: state.currentBalance > 0 ? 'Activa' : 'Sin saldo'
        };
        transaction.set(state.ref, nextWallet, { merge: true });
        state.nextWallet = nextWallet;
      });

      const buyerBalanceAfter = roundMoney(buyerState.currentBalance);
      const clientResult = {
        paymentId,
        paidAt: now,
        chargedAmount: total,
        subtotal,
        shippingFee,
        total,
        cashbackAmount,
        balanceBefore: buyerBalanceBefore,
        balanceAfter: buyerBalanceAfter,
        wallet: {
          id: buyerWalletId,
          uid: buyerWalletId,
          userId: buyerWalletId,
          userName: buyerWallet.userName,
          userEmail: buyerWallet.userEmail,
          balance: buyerBalanceAfter,
          currency: 'MXN',
          activated: true,
          firstRechargeCompleted: true,
          status: buyerBalanceAfter > 0 ? 'Activa' : 'Sin saldo',
          updatedAt: now
        },
        sales,
        saleIds,
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
        buyerName: clean(buyerProfile.name || delivery.fullName),
        buyerEmail: buyerTokenEmail,
        walletId: buyerWalletId,
        subtotal,
        shippingFee,
        total,
        cashbackAmount,
        balanceBefore: buyerBalanceBefore,
        balanceAfter: buyerBalanceAfter,
        products: liveItems.map((item) => ({
          id: item.product.id,
          name: clean(item.product.name || item.product.id).slice(0, 180),
          category: clean(item.product.category || item.product.productCategory || item.product.categoria || ''),
          quantity: item.requested.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          ownerId: item.ownerId ? safeDocId(item.ownerId) : ''
        })),
        delivery,
        saleIds,
        emailStatus: 'Pendiente',
        clientResult,
        createdAt: now,
        updatedAt: now,
        paidAt: now,
        createdBy: buyerTokenEmail,
        requestFingerprint
      };
      transaction.set(paymentRef, paymentRecord);

      return clientResult;
    });

    return res.status(200).json({ success: true, ...result });
  } catch (rawError) {
    const error = normalizeCredentialError(rawError);
    const statusCode = Number(error.statusCode || 500);
    const code = clean(error.code || 'wallet-payment-failed');
    if (statusCode >= 500) {
      console.error('[Cartera][Pago] Error interno:', { code, message: error.message, stack: error.stack });
    } else {
      console.warn('[Cartera][Pago] Solicitud rechazada:', { code, message: error.message, details: error.details || null });
    }
    return res.status(statusCode).json({
      success: false,
      code,
      error: statusCode >= 500 ? 'No se pudo procesar el pago con cartera.' : error.message,
      details: error.details || undefined
    });
  }
};

