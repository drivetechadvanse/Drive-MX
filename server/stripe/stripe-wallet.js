'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const {
  APP_ID,
  clean,
  lower,
  publicError,
  dataRoot,
  privateRoot
} = require('./firebase-admin');

const CURRENCY = 'mxn';
const DISPLAY_CURRENCY = 'MXN';
const MIN_FIRST_RECHARGE = 100;
const MIN_RECHARGE_AFTER_THREE_PRODUCTS = 500;
const PRODUCT_RECHARGE_THRESHOLD = 3;
const MAX_RECHARGE = 1000000;
const STRIPE_CONFIG_DOC = 'stripe_wallet';
const PURPOSE = 'drive_mx_wallet_recharge';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safeDocId(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

function hashId(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stripeConfigRef(db) {
  return privateRoot(db).doc(STRIPE_CONFIG_DOC);
}

function stripeAttemptsCollection(db) {
  return privateRoot(db).doc(STRIPE_CONFIG_DOC).collection('checkout_attempts');
}

function stripeEventsCollection(db) {
  return privateRoot(db).doc(STRIPE_CONFIG_DOC).collection('webhook_events');
}

function normalizeSecretKey(value) {
  return clean(value).replace(/\s+/g, '');
}

function normalizeWebhookSecret(value) {
  return clean(value).replace(/\s+/g, '');
}

function validateSecretKey(value) {
  const key = normalizeSecretKey(value);
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw publicError('La clave secreta de Stripe no es válida.', 400, 'invalid-stripe-secret-key');
  }
  return key;
}

function validateWebhookSecret(value) {
  const secret = normalizeWebhookSecret(value);
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) {
    throw publicError('El secreto de firma del webhook de Stripe no es válido.', 400, 'invalid-stripe-webhook-secret');
  }
  return secret;
}

function getModeFromSecretKey(secretKey = '') {
  if (secretKey.includes('_live_')) return 'live';
  if (secretKey.includes('_test_')) return 'test';
  return '';
}

function maskSecret(value = '') {
  const secret = clean(value);
  if (!secret) return '';
  const prefixEnd = Math.max(secret.indexOf('_', 3) + 1, 8);
  const prefix = secret.slice(0, Math.min(prefixEnd, 12));
  const suffix = secret.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

async function loadStripeConfig(db, { requireComplete = true } = {}) {
  const snapshot = await stripeConfigRef(db).get();
  const stored = snapshot.exists ? (snapshot.data() || {}) : {};
  const secretKey = normalizeSecretKey(stored.secretKey || process.env.STRIPE_SECRET_KEY || '');
  const webhookSecret = normalizeWebhookSecret(stored.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '');
  const configured = Boolean(secretKey && webhookSecret);

  if (requireComplete && !configured) {
    throw publicError(
      'Stripe todavía no está configurado en el Panel de Control.',
      503,
      'stripe-not-configured'
    );
  }

  return {
    secretKey,
    webhookSecret,
    configured,
    mode: getModeFromSecretKey(secretKey),
    updatedAt: Number(stored.updatedAt || 0),
    updatedBy: clean(stored.updatedBy || ''),
    secretKeyMasked: maskSecret(secretKey),
    webhookSecretMasked: maskSecret(webhookSecret)
  };
}

async function saveStripeConfig(db, { secretKey, webhookSecret, actor = '' } = {}) {
  const existing = await loadStripeConfig(db, { requireComplete: false });
  const nextSecretKey = clean(secretKey) ? validateSecretKey(secretKey) : existing.secretKey;
  const nextWebhookSecret = clean(webhookSecret) ? validateWebhookSecret(webhookSecret) : existing.webhookSecret;

  if (!nextSecretKey || !nextWebhookSecret) {
    throw publicError(
      'Ingresa la clave secreta de Stripe y el secreto de firma del webhook.',
      400,
      'stripe-keys-required'
    );
  }

  const stripe = new Stripe(nextSecretKey);
  try {
    await stripe.balance.retrieve();
  } catch (error) {
    console.error('[Stripe][Configuración] Stripe rechazó la clave proporcionada.', error);
    throw publicError(
      'Stripe rechazó la clave secreta. Verifica que esté completa y activa.',
      400,
      'stripe-secret-key-rejected'
    );
  }

  const next = {
    secretKey: nextSecretKey,
    webhookSecret: nextWebhookSecret,
    mode: getModeFromSecretKey(nextSecretKey),
    enabled: true,
    updatedAt: Date.now(),
    updatedBy: clean(actor).slice(0, 254)
  };
  await stripeConfigRef(db).set(next, { merge: true });
  return {
    configured: true,
    mode: next.mode,
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
    secretKeyMasked: maskSecret(nextSecretKey),
    webhookSecretMasked: maskSecret(nextWebhookSecret)
  };
}

function createStripeClient(config) {
  if (!config?.secretKey) {
    throw publicError('Stripe todavía no está configurado.', 503, 'stripe-not-configured');
  }
  return new Stripe(config.secretKey);
}

function isWalletActivated(wallet = {}) {
  return Boolean(
    wallet.activated === true ||
    wallet.firstRechargeCompleted === true ||
    Number(wallet.rechargeCount || 0) > 0 ||
    Number(wallet.totalRecharged || 0) >= MIN_FIRST_RECHARGE
  );
}

function getMinimumRecharge(settings = {}, productCount = 0) {
  const configured = Number(settings.minimumFirstRecharge || settings.minimumRecharge || MIN_FIRST_RECHARGE);
  const base = Number.isFinite(configured) && configured > 0 ? roundMoney(configured) : MIN_FIRST_RECHARGE;
  return Number(productCount || 0) >= PRODUCT_RECHARGE_THRESHOLD
    ? Math.max(base, MIN_RECHARGE_AFTER_THREE_PRODUCTS)
    : base;
}

function validateAmount(rawAmount, wallet = {}, settings = {}, productCount = 0) {
  const amount = roundMoney(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RECHARGE) {
    throw publicError(
      `La recarga debe ser mayor a $0.00 y no puede superar $${MAX_RECHARGE.toLocaleString('es-MX')} MXN.`,
      400,
      'invalid-recharge-amount'
    );
  }
  const amountCents = Math.round(amount * 100);
  if (amountCents < 1) {
    throw publicError('El monto de la recarga no es válido.', 400, 'invalid-recharge-amount');
  }

  const minimum = getMinimumRecharge(settings, productCount);
  if (!isWalletActivated(wallet) && amount < minimum) {
    throw publicError(
      `La primera recarga debe ser de al menos $${minimum.toFixed(2)} MXN.`,
      400,
      'minimum-recharge-required',
      { minimum }
    );
  }

  return { amount, amountCents, minimum };
}

function normalizeProfile(snapshot, decoded = {}) {
  const profile = snapshot?.exists ? (snapshot.data() || {}) : {};
  return {
    ...profile,
    id: decoded.uid,
    uid: decoded.uid,
    email: lower(decoded.email || profile.email || profile.emailNormalized || ''),
    name: clean(profile.name || decoded.name || decoded.email || 'Usuario'),
    phone: clean(profile.phone || '')
  };
}

function assertActiveUserProfile(profile = {}) {
  if (!profile.uid || !profile.email) {
    throw publicError('No se encontró el perfil del usuario.', 403, 'user-profile-not-found');
  }
  if (profile.role === 'admin') {
    throw publicError('La recarga con Stripe es para carteras de usuarios.', 403, 'user-wallet-required');
  }
  if (profile.active === false || profile.blocked === true || profile.accountStatus === 'Bloqueado' || profile.accountStatus === 'Inactivo') {
    throw publicError('La cuenta del usuario está bloqueada o inactiva.', 403, 'user-account-blocked');
  }
}

function buildInitialWallet(userId, profile = {}, timestamp = Date.now()) {
  return {
    id: userId,
    uid: userId,
    userId,
    userName: profile.name || profile.email || 'Usuario',
    userEmail: profile.email || '',
    userPhone: profile.phone || '',
    currency: DISPLAY_CURRENCY,
    balance: 0,
    activated: false,
    firstRechargeCompleted: false,
    firstRechargeAt: null,
    rechargeCount: 0,
    totalRecharged: 0,
    totalCommissions: 0,
    totalPurchases: 0,
    totalCashback: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: profile.email || 'stripe',
    updatedBy: profile.email || 'stripe',
    status: 'Pendiente de activación'
  };
}

async function getCheckoutContext(db, decoded) {
  const root = dataRoot(db);
  const userId = safeDocId(decoded.uid);
  if (!userId || userId !== decoded.uid) {
    throw publicError('El identificador del usuario no es válido.', 400, 'invalid-user-id');
  }

  const profileRef = root.collection('operators').doc(userId);
  const walletRef = root.collection('wallets').doc(userId);
  const settingsRef = root.collection('wallet_settings').doc('config');
  const productsRef = root.collection('user_products').doc(userId).collection('items');

  const [profileSnapshot, walletSnapshot, settingsSnapshot, productsSnapshot] = await Promise.all([
    profileRef.get(),
    walletRef.get(),
    settingsRef.get(),
    productsRef.get()
  ]);

  const profile = normalizeProfile(profileSnapshot, decoded);
  assertActiveUserProfile(profile);
  const wallet = walletSnapshot.exists
    ? { id: walletSnapshot.id, ...(walletSnapshot.data() || {}) }
    : buildInitialWallet(userId, profile);
  const settings = settingsSnapshot.exists ? (settingsSnapshot.data() || {}) : {};
  let activeProductCount = 0;
  productsSnapshot.forEach((documentSnapshot) => {
    const product = documentSnapshot.data() || {};
    if (product.active !== false) activeProductCount += 1;
  });

  if (!walletSnapshot.exists) await walletRef.set(wallet, { merge: true });

  return { root, userId, profile, wallet, settings, activeProductCount };
}

function normalizeRequestId(value, userId) {
  const requested = clean(value).slice(0, 180);
  if (requested && /^[A-Za-z0-9_-]{12,180}$/.test(requested)) return requested;
  return `SWR-${safeDocId(userId)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

async function createWalletCheckout({ db, decoded, rawAmount, requestId, baseUrl }) {
  const config = await loadStripeConfig(db);
  const stripe = createStripeClient(config);
  const context = await getCheckoutContext(db, decoded);
  const validation = validateAmount(rawAmount, context.wallet, context.settings, context.activeProductCount);
  const normalizedRequestId = normalizeRequestId(requestId, context.userId);
  const attemptHash = hashId(`${context.userId}:${normalizedRequestId}`);
  const attemptRef = stripeAttemptsCollection(db).doc(attemptHash);
  const existingAttempt = await attemptRef.get();

  if (existingAttempt.exists) {
    const existing = existingAttempt.data() || {};
    if (existing.userId !== context.userId || Number(existing.amountCents || 0) !== validation.amountCents) {
      throw publicError('La referencia de esta recarga ya fue utilizada con otro monto.', 409, 'stripe-attempt-conflict');
    }
    if (existing.checkoutUrl && existing.checkoutSessionId) {
      return {
        checkoutUrl: existing.checkoutUrl,
        checkoutSessionId: existing.checkoutSessionId,
        rechargeId: existing.rechargeId,
        amount: validation.amount,
        currency: DISPLAY_CURRENCY,
        reused: true
      };
    }
  }

  const rechargeId = `SWR_${attemptHash.slice(0, 40)}`;
  const cleanBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  const successUrl = `${cleanBaseUrl}/?stripe_wallet=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${cleanBaseUrl}/?stripe_wallet=cancelled`;
  const metadata = {
    purpose: PURPOSE,
    appId: APP_ID,
    userId: context.userId,
    walletId: context.userId,
    rechargeId,
    amountCents: String(validation.amountCents),
    requestId: normalizedRequestId.slice(0, 180)
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: context.profile.email,
      client_reference_id: context.userId,
      locale: 'es',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: validation.amountCents,
          product_data: {
            name: 'Recarga de cartera Drive MX',
            description: `Saldo para la cartera de ${context.profile.name || context.profile.email}`.slice(0, 250)
          }
        }
      }],
      metadata,
      payment_intent_data: { metadata },
      success_url: successUrl,
      cancel_url: cancelUrl
    }, {
      idempotencyKey: `drive-mx-wallet-${attemptHash}`
    });
  } catch (error) {
    console.error('[Stripe][Checkout] No se pudo crear la sesión.', error);
    throw publicError(
      error?.message || 'Stripe no pudo iniciar el pago con tarjeta.',
      502,
      'stripe-checkout-create-failed'
    );
  }

  if (!session?.id || !session?.url) {
    throw publicError('Stripe no devolvió una sesión de pago válida.', 502, 'stripe-checkout-invalid-response');
  }

  const createdAt = Date.now();
  const attemptData = {
    id: attemptHash,
    requestId: normalizedRequestId,
    rechargeId,
    purpose: PURPOSE,
    userId: context.userId,
    walletId: context.userId,
    userName: context.profile.name,
    userEmail: context.profile.email,
    userPhone: context.profile.phone,
    amount: validation.amount,
    amountCents: validation.amountCents,
    currency: DISPLAY_CURRENCY,
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    paymentIntentId: clean(session.payment_intent || ''),
    status: 'Pendiente',
    livemode: session.livemode === true,
    createdAt,
    updatedAt: createdAt
  };

  const rechargeData = {
    id: rechargeId,
    rechargeId,
    referenceId: session.id,
    walletId: context.userId,
    userId: context.userId,
    userName: context.profile.name,
    userEmail: context.profile.email,
    userPhone: context.profile.phone,
    type: 'recharge',
    direction: 'credit',
    concept: 'Recarga de saldo con tarjeta Stripe',
    amount: validation.amount,
    currency: DISPLAY_CURRENCY,
    paymentMethod: 'Tarjeta Stripe',
    paymentProvider: 'stripe',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: clean(session.payment_intent || ''),
    status: 'Pendiente',
    createdAt,
    updatedAt: createdAt,
    createdBy: context.profile.email
  };

  await Promise.all([
    attemptRef.set(attemptData, { merge: true }),
    context.root.collection('wallet_recharges').doc(rechargeId).set(rechargeData, { merge: true })
  ]);

  return {
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    rechargeId,
    amount: validation.amount,
    currency: DISPLAY_CURRENCY,
    reused: false
  };
}

function sessionPaymentIntentId(session = {}) {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return clean(session.payment_intent?.id || '');
}

function validateStripeSession(session = {}) {
  const metadata = session.metadata || {};
  if (metadata.purpose !== PURPOSE || metadata.appId !== APP_ID) {
    throw publicError('La sesión de Stripe no pertenece a una recarga de Drive MX.', 400, 'invalid-stripe-session-purpose');
  }

  const userId = safeDocId(metadata.userId || metadata.walletId || session.client_reference_id || '');
  const rechargeId = safeDocId(metadata.rechargeId || '');
  const amountCents = Number(session.amount_total || 0);
  const metadataAmountCents = Number(metadata.amountCents || 0);
  if (!userId || !rechargeId || !Number.isInteger(amountCents) || amountCents <= 0 || amountCents !== metadataAmountCents) {
    throw publicError('La información de la recarga de Stripe no es válida.', 400, 'invalid-stripe-session-data');
  }
  if (lower(session.currency) !== CURRENCY) {
    throw publicError('La moneda de la recarga de Stripe no es válida.', 400, 'invalid-stripe-session-currency');
  }

  return {
    metadata,
    userId,
    rechargeId,
    amountCents,
    amount: roundMoney(amountCents / 100)
  };
}

async function finalizePaidCheckout({ db, session, source = 'stripe' }) {
  const validated = validateStripeSession(session);
  if (session.payment_status !== 'paid') {
    return {
      credited: false,
      status: session.payment_status || session.status || 'processing',
      userId: validated.userId,
      rechargeId: validated.rechargeId,
      amount: validated.amount
    };
  }

  const root = dataRoot(db);
  const profileRef = root.collection('operators').doc(validated.userId);
  const walletRef = root.collection('wallets').doc(validated.userId);
  const movementId = safeDocId(`mov_recharge_stripe_${session.id}`);
  const movementRef = walletRef.collection('movements').doc(movementId);
  const rechargeRef = root.collection('wallet_recharges').doc(validated.rechargeId);
  const attemptRef = stripeAttemptsCollection(db).doc(hashId(`${validated.userId}:${validated.metadata.requestId || ''}`));
  const confirmedAt = Date.now();

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, walletSnapshot, movementSnapshot, rechargeSnapshot, attemptSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(walletRef),
      transaction.get(movementRef),
      transaction.get(rechargeRef),
      transaction.get(attemptRef)
    ]);

    const profile = normalizeProfile(profileSnapshot, { uid: validated.userId });
    const existingRecharge = rechargeSnapshot.exists ? (rechargeSnapshot.data() || {}) : {};
    const existingAttempt = attemptSnapshot.exists ? (attemptSnapshot.data() || {}) : {};

    if (existingAttempt.userId && existingAttempt.userId !== validated.userId) {
      throw publicError('La sesión de Stripe no coincide con el usuario de la recarga.', 409, 'stripe-user-mismatch');
    }
    if (existingAttempt.amountCents && Number(existingAttempt.amountCents) !== validated.amountCents) {
      throw publicError('El monto confirmado por Stripe no coincide con la recarga.', 409, 'stripe-amount-mismatch');
    }
    if (existingRecharge.walletId && existingRecharge.walletId !== validated.userId) {
      throw publicError('La recarga de Stripe no coincide con la cartera.', 409, 'stripe-wallet-mismatch');
    }

    if (movementSnapshot.exists) {
      const movement = movementSnapshot.data() || {};
      return {
        credited: true,
        idempotent: true,
        status: 'paid',
        userId: validated.userId,
        rechargeId: validated.rechargeId,
        amount: validated.amount,
        balanceAfter: roundMoney(movement.balanceAfter || 0)
      };
    }

    const currentWallet = walletSnapshot.exists
      ? { id: walletSnapshot.id, ...(walletSnapshot.data() || {}) }
      : buildInitialWallet(validated.userId, profile, confirmedAt);
    const balanceBefore = roundMoney(currentWallet.balance || 0);
    const balanceAfter = roundMoney(balanceBefore + validated.amount);
    const actor = 'stripe';
    const nextWallet = {
      ...currentWallet,
      id: validated.userId,
      uid: validated.userId,
      userId: validated.userId,
      userName: currentWallet.userName || profile.name || profile.email || 'Usuario',
      userEmail: currentWallet.userEmail || profile.email || '',
      userPhone: currentWallet.userPhone || profile.phone || '',
      currency: DISPLAY_CURRENCY,
      balance: balanceAfter,
      activated: true,
      firstRechargeCompleted: true,
      firstRechargeAt: currentWallet.firstRechargeAt || confirmedAt,
      rechargeCount: Number(currentWallet.rechargeCount || 0) + 1,
      totalRecharged: roundMoney(Number(currentWallet.totalRecharged || 0) + validated.amount),
      lastRechargeAt: confirmedAt,
      lastStripeRechargeId: validated.rechargeId,
      lastStripeCheckoutSessionId: session.id,
      lastStripePaymentIntentId: sessionPaymentIntentId(session),
      updatedAt: confirmedAt,
      updatedBy: actor,
      status: balanceAfter > 0 ? 'Activa' : 'Sin saldo'
    };

    const movement = {
      id: movementId,
      movementId,
      walletId: validated.userId,
      userId: validated.userId,
      userName: nextWallet.userName,
      userEmail: nextWallet.userEmail,
      type: 'recharge',
      direction: 'credit',
      concept: 'Recarga de saldo con tarjeta Stripe',
      amount: validated.amount,
      balanceBefore,
      balanceAfter,
      currency: DISPLAY_CURRENCY,
      referenceId: session.id,
      paymentMethod: 'Tarjeta Stripe',
      paymentProvider: 'stripe',
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: sessionPaymentIntentId(session),
      createdAt: confirmedAt,
      createdBy: actor
    };

    const recharge = {
      ...existingRecharge,
      ...movement,
      id: validated.rechargeId,
      rechargeId: validated.rechargeId,
      status: 'Completada',
      paymentStatus: session.payment_status,
      livemode: session.livemode === true,
      approvedAt: confirmedAt,
      approvedBy: actor,
      updatedAt: confirmedAt,
      confirmationSource: source
    };

    transaction.set(walletRef, nextWallet, { merge: true });
    transaction.set(movementRef, movement);
    transaction.set(rechargeRef, recharge, { merge: true });
    transaction.set(attemptRef, {
      ...existingAttempt,
      userId: validated.userId,
      walletId: validated.userId,
      rechargeId: validated.rechargeId,
      checkoutSessionId: session.id,
      paymentIntentId: sessionPaymentIntentId(session),
      amount: validated.amount,
      amountCents: validated.amountCents,
      currency: DISPLAY_CURRENCY,
      status: 'Completada',
      creditedAt: confirmedAt,
      updatedAt: confirmedAt,
      confirmationSource: source
    }, { merge: true });

    return {
      credited: true,
      idempotent: false,
      status: 'paid',
      userId: validated.userId,
      rechargeId: validated.rechargeId,
      amount: validated.amount,
      balanceBefore,
      balanceAfter
    };
  });
}

async function markCheckoutStatus({ db, session, status, source = 'stripe' }) {
  const validated = validateStripeSession(session);
  const root = dataRoot(db);
  const updatedAt = Date.now();
  const rechargeRef = root.collection('wallet_recharges').doc(validated.rechargeId);
  await rechargeRef.set({
    status,
    paymentStatus: session.payment_status || '',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: sessionPaymentIntentId(session),
    updatedAt,
    confirmationSource: source
  }, { merge: true });
  return {
    credited: false,
    status,
    userId: validated.userId,
    rechargeId: validated.rechargeId,
    amount: validated.amount
  };
}

async function rememberWebhookEvent(db, event, result = {}) {
  if (!event?.id) return;
  await stripeEventsCollection(db).doc(safeDocId(event.id)).set({
    eventId: event.id,
    eventType: event.type || '',
    created: Number(event.created || 0),
    livemode: event.livemode === true,
    processedAt: Date.now(),
    result
  }, { merge: true });
}

module.exports = {
  CURRENCY,
  DISPLAY_CURRENCY,
  PURPOSE,
  MAX_RECHARGE,
  roundMoney,
  safeDocId,
  loadStripeConfig,
  saveStripeConfig,
  createStripeClient,
  createWalletCheckout,
  validateStripeSession,
  finalizePaidCheckout,
  markCheckoutStatus,
  rememberWebhookEvent
};
