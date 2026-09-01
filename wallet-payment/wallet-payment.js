(function (global) {
  'use strict';

  const React = global.React;
  if (!React) throw new Error('DriveMxWalletPayment: React no está disponible.');

  const { useState, useEffect, useRef, useCallback } = React;
  const MAX_PRODUCTS = 40;
  const GENERAL_ERROR = 'No se pudo realizar el pago con cartera.';

  const clean = (value) => String(value ?? '').trim();
  const normalizeEmail = (value) => clean(value).replace(/\s+/g, '').toLowerCase();
  const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const safeDocId = (value) => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_');

  function paymentError(message, code = 'wallet-payment-error', details = null) {
    const error = new Error(message || GENERAL_ERROR);
    error.code = code;
    if (details) error.details = details;
    return error;
  }

  function formatMoney(value, Wallet) {
    if (typeof Wallet?.formatMoney === 'function') return Wallet.formatMoney(value);
    return `$${roundMoney(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  }

  function getProfileId(profile = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    return safeDocId(source.uid || source.id || source.userId || '');
  }

  function profileIsBlocked(profile = {}) {
    const status = clean(profile.accountStatus || profile.status).toLowerCase();
    return profile.active === false
      || profile.blocked === true
      || profile.isBlocked === true
      || status === 'bloqueado'
      || status === 'inactivo';
  }

  function getProductStock(product = {}) {
    const stock = Math.floor(Number(product.stock ?? product.availableStock ?? 0));
    return Number.isFinite(stock) && stock > 0 ? stock : 0;
  }

  function getProductPrice(product = {}) {
    const price = Number(product.price ?? product.unitPrice ?? 0);
    if (!Number.isFinite(price) || price < 0 || price > 10000000) {
      throw paymentError(`El precio de ${clean(product.name) || 'un producto'} no es válido.`, 'product-price-invalid', {
        productId: clean(product.id)
      });
    }
    return roundMoney(price);
  }

  function getProductOwnerId(product = {}) {
    return safeDocId(product.ownerId || product.sellerId || product.userId || product.createdByUid || '');
  }

  function createPaymentId() {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6);
    return `WP-${Date.now()}-${random}`;
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

  function normalizeOrder(order = {}) {
    const sourceProducts = Array.isArray(order.products) ? order.products : [];
    if (sourceProducts.length < 1) {
      throw paymentError('No se encontraron productos válidos para pagar.', 'wallet-products-missing');
    }
    if (sourceProducts.length > MAX_PRODUCTS) {
      throw paymentError(`El pago con cartera admite hasta ${MAX_PRODUCTS} productos distintos por operación.`, 'wallet-products-limit');
    }

    const seenIds = new Set();
    const products = sourceProducts.map((item, index) => {
      const id = clean(item?.id);
      const quantity = Math.floor(Number(item?.quantity ?? item?.productQuantity ?? 0));
      if (!id || id.length > 180) {
        throw paymentError('Uno de los productos no contiene un ID válido.', 'product-id-invalid', { index });
      }
      if (seenIds.has(id)) {
        throw paymentError('El carrito contiene un producto duplicado.', 'product-duplicated', { productId: id });
      }
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000000) {
        throw paymentError('La cantidad de uno de los productos no es válida.', 'product-quantity-invalid', { productId: id });
      }
      seenIds.add(id);
      return { id, quantity };
    });

    const shippingFee = roundMoney(order.cart?.shippingFee || 0);
    const clientTotal = roundMoney(order.cart?.total || 0);
    if (!Number.isFinite(shippingFee) || shippingFee < 0 || shippingFee > 1000000) {
      throw paymentError('El costo de envío no es válido.', 'wallet-shipping-invalid');
    }
    if (!Number.isFinite(clientTotal) || clientTotal <= 0 || clientTotal > 20000000) {
      throw paymentError('El total de la compra no es válido.', 'wallet-total-invalid');
    }

    const delivery = order.delivery && typeof order.delivery === 'object' ? order.delivery : {};
    const signatureSource = JSON.stringify({
      products: [...products].sort((a, b) => a.id.localeCompare(b.id)),
      shippingFee,
      clientTotal,
      delivery: {
        street: clean(delivery.street),
        state: clean(delivery.state),
        municipality: clean(delivery.municipality),
        neighborhood: clean(delivery.neighborhood),
        zip: clean(delivery.zip),
        fullName: clean(delivery.fullName),
        phone: clean(delivery.phone),
        email: normalizeEmail(delivery.email),
        references: clean(delivery.references)
      }
    });

    return {
      products,
      shippingFee,
      clientTotal,
      delivery,
      orderSignature: createOrderSignature(signatureSource)
    };
  }

  function dataDoc(fbase, db, appId, ...segments) {
    return fbase.doc(db, 'artifacts', appId, 'public', 'data', ...segments);
  }

  function normalizeFirestoreError(error = {}) {
    const existingCode = clean(error.code).toLowerCase();
    if (
      existingCode.startsWith('wallet-')
      || existingCode.startsWith('product-')
      || existingCode.startsWith('order-')
      || existingCode.startsWith('payment-')
    ) return error;

    const code = existingCode.replace(/^firestore\//, '');
    if (code.includes('permission-denied')) {
      return paymentError('Firestore no autorizó el descuento de la cartera.', 'wallet-payment-permission-denied');
    }
    if (code.includes('unavailable') || code.includes('network')) {
      return paymentError('No se pudo confirmar el pago por un problema de conexión.', 'wallet-payment-network');
    }
    if (code.includes('aborted')) {
      return paymentError('La cartera cambió mientras se confirmaba el pago. Intenta nuevamente.', 'wallet-payment-aborted');
    }
    return paymentError(error?.message || GENERAL_ERROR, existingCode || 'wallet-payment-error');
  }

  async function processWalletPaymentViaApi({ firebaseUser, paymentId, order } = {}) {
    const currentUser = firebaseUser;
    if (!currentUser?.uid || currentUser?.isAnonymous === true || typeof currentUser.getIdToken !== 'function') {
      throw paymentError('Inicia sesión con el usuario propietario de la cartera.', 'wallet-auth-required');
    }

    const token = await currentUser.getIdToken();
    let response;
    try {
      response = await fetch('/api/pay-with-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ paymentId, order })
      });
    } catch (error) {
      throw paymentError('No se pudo conectar con el servidor para procesar el pago con cartera.', 'wallet-payment-network', {
        cause: clean(error?.message)
      });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      throw paymentError('El servidor devolvió una respuesta inválida al procesar la cartera.', 'wallet-payment-server-response', {
        httpStatus: response.status
      });
    }

    if (!response.ok || payload?.success !== true) {
      const code = clean(payload?.code || `wallet-payment-http-${response.status}`).toLowerCase();
      const message = clean(payload?.error || payload?.message || GENERAL_ERROR);
      throw paymentError(message, code || 'wallet-payment-error', {
        ...(payload?.details && typeof payload.details === 'object' ? payload.details : {}),
        serverStage: clean(payload?.stage),
        httpStatus: response.status
      });
    }

    const sales = Array.isArray(payload.sales) ? payload.sales : [];
    const normalizedProducts = sales.map((sale) => ({
      id: clean(sale.productId),
      name: clean(sale.productName),
      quantity: Math.max(1, Math.floor(Number(sale.quantity ?? sale.productQuantity ?? 1)) || 1),
      unitPrice: roundMoney(sale.unitPrice ?? sale.productUnitPrice ?? 0),
      lineTotal: roundMoney(sale.productTotal ?? sale.productCost ?? 0),
      ownerId: safeDocId(sale.sellerId || ''),
      saleId: clean(sale.saleId),
      sizes: Array.isArray(sale.productSizes) ? sale.productSizes : [],
      colors: Array.isArray(sale.productColors) ? sale.productColors : []
    })).filter((item) => item.id);

    return {
      ...payload,
      movementId: clean(payload.movementId || `mov_purchase_${paymentId}`),
      products: normalizedProducts,
      serverFinalized: true
    };
  }

  async function readExistingWallet({ fbase, appId, user, Wallet } = {}) {
    const uid = safeDocId(user?.uid || user?.id || '');
    if (!uid) throw paymentError('No se pudo identificar al usuario autenticado.', 'wallet-user-invalid');
    const db = fbase.getFirestore();
    const walletRef = dataDoc(fbase, db, appId, 'wallets', uid);
    const snapshot = await fbase.getDoc(walletRef);
    if (!snapshot.exists()) {
      throw paymentError('La cuenta no tiene una cartera existente.', 'wallet-not-found', { availableBalance: 0 });
    }
    const rawWallet = { id: snapshot.id, ...snapshot.data() };
    const wallet = typeof Wallet?.normalizeWallet === 'function'
      ? Wallet.normalizeWallet(rawWallet, user)
      : { ...rawWallet, balance: roundMoney(rawWallet.balance || 0) };
    return { rawWallet, wallet, walletRef };
  }

  async function processWalletPayment({ fbase, appId, Wallet, firebaseUser, sessionUser, paymentId, order } = {}) {
    if (!fbase?.runTransaction || !fbase?.getFirestore || !fbase?.doc) {
      throw paymentError('Firebase no está disponible para realizar el cobro.', 'wallet-firebase-unavailable');
    }

    const currentUser = firebaseUser || fbase.getAuth?.()?.currentUser;
    const uid = safeDocId(currentUser?.uid);
    const profileId = getProfileId(sessionUser);
    const email = normalizeEmail(currentUser?.email || sessionUser?.email);
    if (!uid || currentUser?.isAnonymous === true || !email || uid !== profileId) {
      throw paymentError('Inicia sesión con el usuario propietario de la cartera.', 'wallet-auth-required');
    }
    if (sessionUser?.role === 'admin' || profileIsBlocked(sessionUser)) {
      throw paymentError('La cuenta no está disponible para pagar con cartera.', 'wallet-account-not-available');
    }

    paymentId = clean(paymentId);
    if (!/^WP-\d{10,}-[A-Z0-9]{6}$/.test(paymentId)) {
      throw paymentError('El identificador del pago no es válido.', 'payment-id-invalid');
    }

    const normalizedOrder = normalizeOrder(order);
    const db = fbase.getFirestore();
    const walletRef = dataDoc(fbase, db, appId, 'wallets', uid);
    const profileRef = dataDoc(fbase, db, appId, 'operators', uid);
    const movementId = safeDocId(`mov_purchase_${paymentId}`);
    const movementRef = dataDoc(fbase, db, appId, 'wallets', uid, 'movements', movementId);
    const productRefs = normalizedOrder.products.map((item) => dataDoc(fbase, db, appId, 'products', item.id));
    let firestoreStage = 'inicio';

    try {
      return await fbase.runTransaction(db, async (transaction) => {
        firestoreStage = 'leer-perfil';
        const profileSnapshot = await transaction.get(profileRef);
        firestoreStage = 'leer-cartera';
        const walletSnapshot = await transaction.get(walletRef);
        firestoreStage = 'leer-movimiento';
        const movementSnapshot = await transaction.get(movementRef);

        if (!profileSnapshot.exists()) {
          throw paymentError('No se encontró el perfil del usuario autenticado.', 'wallet-profile-not-found');
        }
        const liveProfile = { id: profileSnapshot.id, ...profileSnapshot.data() };
        if (liveProfile.role === 'admin' || profileIsBlocked(liveProfile)) {
          throw paymentError('La cuenta no está disponible para pagar con cartera.', 'wallet-account-not-available');
        }
        if (normalizeEmail(liveProfile.email) && normalizeEmail(liveProfile.email) !== email) {
          throw paymentError('La cartera no corresponde al usuario autenticado.', 'wallet-profile-mismatch');
        }
        if (!walletSnapshot.exists()) {
          throw paymentError('La cuenta no tiene una cartera existente.', 'wallet-not-found', { availableBalance: 0 });
        }

        const rawWallet = { id: walletSnapshot.id, ...walletSnapshot.data() };
        const currentWallet = typeof Wallet?.normalizeWallet === 'function'
          ? Wallet.normalizeWallet(rawWallet, liveProfile)
          : { ...rawWallet, balance: roundMoney(rawWallet.balance || 0) };

        if (movementSnapshot.exists()) {
          const existing = { id: movementSnapshot.id, ...movementSnapshot.data() };
          const existingTotal = roundMoney(existing.total ?? existing.absoluteAmount ?? Math.abs(Number(existing.amount || 0)));
          if (
            existing.paymentId !== paymentId
            || existing.walletId !== uid
            || existing.type !== 'purchase'
            || existing.orderSignature !== normalizedOrder.orderSignature
            || Math.abs(existingTotal - normalizedOrder.clientTotal) > 0.01
          ) {
            throw paymentError('El identificador del pago ya pertenece a otra compra.', 'payment-id-conflict');
          }
          return {
            paymentId,
            movementId,
            paidAt: Number(existing.createdAt || Date.now()),
            subtotal: roundMoney(existing.subtotal || 0),
            shippingFee: roundMoney(existing.shippingFee || 0),
            total: existingTotal,
            chargedAmount: existingTotal,
            balanceBefore: roundMoney(existing.balanceBefore || 0),
            balanceAfter: roundMoney(existing.balanceAfter || 0),
            products: Array.isArray(existing.products) ? existing.products : [],
            orderSignature: existing.orderSignature,
            idempotent: true
          };
        }

        const active = typeof Wallet?.isWalletActivated === 'function'
          ? Wallet.isWalletActivated(currentWallet)
          : Boolean(currentWallet.activated === true || currentWallet.firstRechargeCompleted === true);
        if (!active) {
          throw paymentError('La cartera existente todavía no está activa.', 'wallet-not-active', {
            availableBalance: roundMoney(currentWallet.balance || 0)
          });
        }

        const productSnapshots = [];
        firestoreStage = 'leer-productos';
        for (const productRef of productRefs) productSnapshots.push(await transaction.get(productRef));

        const liveProducts = normalizedOrder.products.map((requested, index) => {
          const snapshot = productSnapshots[index];
          if (!snapshot?.exists()) {
            throw paymentError('Uno de los productos ya no está disponible.', 'product-not-found', { productId: requested.id });
          }
          const product = { ...(snapshot.data() || {}), id: snapshot.id };
          if (product.active === false) {
            throw paymentError(`${clean(product.name) || 'Un producto'} ya no está activo.`, 'product-not-active', { productId: requested.id });
          }
          const stock = getProductStock(product);
          if (stock < requested.quantity) {
            throw paymentError(`Inventario insuficiente para ${clean(product.name) || requested.id}.`, 'product-stock-insufficient', {
              productId: requested.id,
              availableStock: stock,
              requestedQuantity: requested.quantity
            });
          }
          const unitPrice = getProductPrice(product);
          const lineTotal = roundMoney(unitPrice * requested.quantity);
          const saleBaseId = safeDocId(`wallet_${paymentId}`);
          const saleId = normalizedOrder.products.length > 1 ? `${saleBaseId}_${index + 1}` : saleBaseId;
          return {
            index,
            id: requested.id,
            name: clean(product.name).slice(0, 180),
            quantity: requested.quantity,
            unitPrice,
            lineTotal,
            stockBefore: stock,
            stockAfter: stock - requested.quantity,
            ownerId: getProductOwnerId(product),
            saleId
          };
        });

        const subtotal = roundMoney(liveProducts.reduce((sum, item) => sum + item.lineTotal, 0));
        const shippingFee = normalizedOrder.shippingFee;
        const total = roundMoney(subtotal + shippingFee);
        if (total <= 0) {
          throw paymentError('El total de la compra debe ser mayor a $0.00.', 'wallet-total-invalid');
        }
        if (Math.abs(total - normalizedOrder.clientTotal) > 0.01) {
          throw paymentError('El total de la compra cambió. Regresa al carrito y revisa los importes.', 'order-total-changed', {
            clientTotal: normalizedOrder.clientTotal,
            currentTotal: total
          });
        }

        const balanceBefore = roundMoney(currentWallet.balance || 0);
        if (balanceBefore < total) {
          throw paymentError('El saldo disponible es insuficiente para completar la compra.', 'wallet-insufficient-funds', {
            availableBalance: balanceBefore,
            requiredTotal: total
          });
        }

        const paidAt = Date.now();
        const balanceAfter = roundMoney(balanceBefore - total);
        const movement = {
          id: movementId,
          movementId,
          walletId: uid,
          userId: uid,
          userName: clean(currentWallet.userName || liveProfile.name || 'Usuario').slice(0, 180),
          userEmail: email.slice(0, 254),
          type: 'purchase',
          direction: 'debit',
          concept: 'Compra pagada con cartera',
          amount: -total,
          absoluteAmount: total,
          balanceBefore,
          balanceAfter,
          currency: 'MXN',
          paymentId,
          orderId: paymentId,
          orderSignature: normalizedOrder.orderSignature,
          itemCount: liveProducts.length,
          subtotal,
          shippingFee,
          total,
          products: liveProducts,
          createdAt: paidAt,
          createdBy: email
        };

        firestoreStage = 'commit-cartera-y-movimiento';
        transaction.set(walletRef, {
          balance: balanceAfter,
          updatedAt: paidAt,
          updatedBy: email,
          status: balanceAfter > 0 ? 'Activa' : 'Sin saldo',
          lastWalletPaymentId: paymentId
        }, { merge: true });
        transaction.set(movementRef, movement);

        return {
          paymentId,
          movementId,
          paidAt,
          subtotal,
          shippingFee,
          total,
          chargedAmount: total,
          balanceBefore,
          balanceAfter,
          products: liveProducts,
          orderSignature: normalizedOrder.orderSignature,
          idempotent: false
        };
      });
    } catch (error) {
      const normalized = normalizeFirestoreError(error);
      if (clean(normalized?.code).toLowerCase().includes('permission-denied')) {
        normalized.message = `Firestore rechazó el pago con cartera. Etapa: ${firestoreStage}.`;
        normalized.details = { ...(normalized.details || {}), firestoreStage };
      }
      throw normalized;
    }
  }

  function useWalletPayment({ fbase, appId, Wallet, fbUser = null, sessionUser = null, enabled = false, onRequestLogin = () => {} } = {}) {
    const [loading, setLoading] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState('');
    const [identity, setIdentity] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [walletExists, setWalletExists] = useState(false);
    const [walletActive, setWalletActive] = useState(false);
    const paymentIdRef = useRef('');

    const profileId = getProfileId(sessionUser || {});
    const authenticated = Boolean(
      fbUser?.uid
      && fbUser?.isAnonymous !== true
      && fbUser?.email
      && sessionUser
      && sessionUser.role !== 'admin'
      && !profileIsBlocked(sessionUser)
      && safeDocId(fbUser.uid) === profileId
    );

    const clearState = useCallback((keepPaymentId = false) => {
      setLoading(false);
      setPaying(false);
      setError('');
      setIdentity(null);
      setWallet(null);
      setWalletExists(false);
      setWalletActive(false);
      if (!keepPaymentId) paymentIdRef.current = '';
    }, []);

    const refresh = useCallback(async () => {
      if (!enabled) {
        clearState(false);
        return null;
      }
      if (!authenticated) {
        setLoading(false);
        setError('');
        setIdentity(null);
        setWallet(null);
        setWalletExists(false);
        setWalletActive(false);
        return null;
      }

      setLoading(true);
      setError('');
      try {
        const result = await readExistingWallet({ fbase, appId, user: sessionUser, Wallet });
        const active = typeof Wallet?.isWalletActivated === 'function'
          ? Wallet.isWalletActivated(result.wallet)
          : Boolean(result.wallet.activated === true || result.wallet.firstRechargeCompleted === true);
        setIdentity({
          uid: profileId,
          name: clean(sessionUser?.name || result.wallet.userName || 'Usuario'),
          email: normalizeEmail(sessionUser?.email || result.wallet.userEmail || fbUser?.email)
        });
        setWallet(result.wallet);
        setWalletExists(true);
        setWalletActive(active);
        if (!active) setError('La cartera existente todavía no está activa.');
        return result.wallet;
      } catch (readError) {
        const normalized = normalizeFirestoreError(readError);
        setIdentity({
          uid: profileId,
          name: clean(sessionUser?.name || 'Usuario'),
          email: normalizeEmail(sessionUser?.email || fbUser?.email)
        });
        setWallet(null);
        setWalletExists(false);
        setWalletActive(false);
        setError(normalized.message || GENERAL_ERROR);
        return null;
      } finally {
        setLoading(false);
      }
    }, [enabled, authenticated, fbase, appId, sessionUser, Wallet, profileId, fbUser?.email, clearState]);

    useEffect(() => {
      let cancelled = false;
      if (!enabled) {
        clearState(false);
        return () => { cancelled = true; };
      }
      Promise.resolve(refresh()).catch(() => {});
      return () => { cancelled = true; void cancelled; };
    }, [enabled, authenticated, profileId, refresh, clearState]);

    const requestLogin = useCallback(() => {
      if (authenticated) return;
      onRequestLogin?.();
    }, [authenticated, onRequestLogin]);

    const getOrCreatePaymentId = useCallback(() => {
      if (!paymentIdRef.current) paymentIdRef.current = createPaymentId();
      return paymentIdRef.current;
    }, []);

    const canPay = useCallback((total = 0) => {
      const required = roundMoney(total);
      return Boolean(
        authenticated
        && walletExists
        && walletActive
        && !loading
        && !paying
        && required > 0
        && roundMoney(wallet?.balance || 0) >= required
      );
    }, [authenticated, walletExists, walletActive, loading, paying, wallet?.balance]);

    const pay = useCallback(async ({ paymentId = '', order = {} } = {}) => {
      if (!authenticated) {
        requestLogin();
        throw paymentError('Inicia sesión antes de pagar con cartera.', 'wallet-auth-required');
      }
      if (paying) throw paymentError('El pago con cartera ya se está procesando.', 'wallet-payment-in-progress');

      setPaying(true);
      setError('');
      try {
        const resolvedPaymentId = paymentId || getOrCreatePaymentId();
        const result = await processWalletPaymentViaApi({
          firebaseUser: fbUser,
          paymentId: resolvedPaymentId,
          order
        });
        setWallet((previous) => previous ? ({ ...previous, balance: result.balanceAfter, updatedAt: result.paidAt, status: result.balanceAfter > 0 ? 'Activa' : 'Sin saldo' }) : previous);
        setWalletExists(true);
        setWalletActive(true);
        return result;
      } catch (payError) {
        const normalized = normalizeFirestoreError(payError);
        setError(normalized.message || GENERAL_ERROR);
        if (normalized.details?.availableBalance != null) {
          setWallet((previous) => previous ? ({ ...previous, balance: roundMoney(normalized.details.availableBalance) }) : previous);
        }
        throw normalized;
      } finally {
        setPaying(false);
      }
    }, [authenticated, paying, requestLogin, fbase, appId, Wallet, fbUser, sessionUser, getOrCreatePaymentId]);

    const reset = useCallback(async () => {
      clearState(false);
    }, [clearState]);

    return {
      authenticated,
      verified: authenticated && walletExists,
      loading,
      verifying: loading,
      paying,
      error,
      identity,
      wallet,
      walletExists,
      walletActive,
      availableBalance: roundMoney(wallet?.balance || 0),
      refresh,
      requestLogin,
      getOrCreatePaymentId,
      canPay,
      pay,
      reset,
      formatMoney: (value) => formatMoney(value, Wallet)
    };
  }

  function WalletCredentialsCard({ manager } = {}) {
    if (!manager) return null;

    if (!manager.authenticated) {
      return React.createElement('div', { className: 'drive-mx-wallet-payment-card' },
        React.createElement('div', { className: 'drive-mx-wallet-payment-card__copy' },
          React.createElement('p', { className: 'drive-mx-wallet-payment-card__title' }, 'Inicia sesión para pagar con cartera'),
          React.createElement('p', { className: 'drive-mx-wallet-payment-card__text' }, 'La navegación, el carrito y los demás métodos de pago continúan siendo públicos. El inicio de sesión se solicita únicamente para consultar tu cartera personal.')
        ),
        React.createElement('button', {
          type: 'button',
          onClick: manager.requestLogin,
          className: 'btn-primary h-11 drive-mx-wallet-payment-card__button'
        }, 'Iniciar sesión')
      );
    }

    if (manager.loading) {
      return React.createElement('div', { className: 'drive-mx-wallet-payment-card' },
        React.createElement('p', { className: 'drive-mx-wallet-payment-card__title' }, 'Consultando cartera existente...')
      );
    }

    return React.createElement('div', { className: 'drive-mx-wallet-payment-card' },
      React.createElement('div', { className: 'drive-mx-wallet-payment-card__copy' },
        React.createElement('p', { className: 'drive-mx-wallet-payment-card__title' }, manager.walletExists ? 'Cartera identificada' : 'Cartera no disponible'),
        manager.identity
          ? React.createElement('p', { className: 'drive-mx-wallet-payment-card__text' }, `${manager.identity.name || 'Usuario'} · ${manager.identity.email || ''}`)
          : null,
        manager.error
          ? React.createElement('p', { className: 'drive-mx-wallet-payment-card__error', role: 'alert' }, manager.error)
          : React.createElement('p', { className: 'drive-mx-wallet-payment-card__text' }, 'El saldo se volverá a consultar dentro de la transacción al confirmar el pago.')
      ),
      React.createElement('button', {
        type: 'button',
        onClick: manager.refresh,
        disabled: manager.loading || manager.paying,
        className: 'drive-mx-wallet-payment-card__refresh'
      }, manager.loading ? 'Consultando...' : 'Actualizar saldo')
    );
  }

  function WalletBalanceBadge({ manager, total = 0 } = {}) {
    if (!manager?.verified) return null;
    const available = roundMoney(manager.availableBalance || 0);
    const purchaseTotal = roundMoney(total || 0);
    const remaining = roundMoney(available - purchaseTotal);
    const sufficient = remaining >= 0 && manager.walletActive;
    const money = manager.formatMoney || ((value) => formatMoney(value));

    return React.createElement('div', { className: `drive-mx-wallet-balance ${sufficient ? '' : 'drive-mx-wallet-balance--insufficient'}` },
      React.createElement('div', { className: 'drive-mx-wallet-balance__row' },
        React.createElement('span', null, 'Saldo disponible'),
        React.createElement('strong', null, money(available))
      ),
      React.createElement('div', { className: 'drive-mx-wallet-balance__row' },
        React.createElement('span', null, 'Total de compra'),
        React.createElement('strong', null, money(purchaseTotal))
      ),
      React.createElement('div', { className: 'drive-mx-wallet-balance__row drive-mx-wallet-balance__row--remaining' },
        React.createElement('span', null, 'Saldo después del pago'),
        React.createElement('strong', null, money(remaining))
      ),
      !sufficient
        ? React.createElement('p', { className: 'drive-mx-wallet-balance__warning' }, manager.walletActive ? 'Saldo insuficiente' : 'Cartera no activa')
        : null
    );
  }

  global.DriveMxWalletPayment = {
    available: true,
    BUILD: '2026-08-26-existing-wallet-payment-v1',
    MAX_PRODUCTS,
    clean,
    normalizeEmail,
    roundMoney,
    createPaymentId,
    createOrderSignature,
    normalizeOrder,
    readExistingWallet,
    processWalletPayment,
    useWalletPayment,
    WalletCredentialsCard,
    WalletBalanceBadge
  };
})(window);
