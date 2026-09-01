(function (global) {
  'use strict';

  const CONFIG_ENDPOINT = '/api/stripe-wallet-config';
  const CHECKOUT_ENDPOINT = '/api/create-stripe-wallet-checkout';
  const STATUS_ENDPOINT = '/api/stripe-wallet-status';
  const STRIPE_JS_URL = 'https://js.stripe.com/dahlia/stripe.js';
  let stripeJsPromise = null;

  const clean = (value) => String(value ?? '').trim();

  function createError(message, code = 'stripe-wallet-error', details = {}) {
    const error = new Error(message || 'No se pudo completar la operación con Stripe.');
    error.code = code;
    error.details = details;
    return error;
  }

  async function getFirebaseToken(fbase, forceRefresh = false) {
    if (!fbase || typeof fbase.getAuth !== 'function') {
      throw createError('Firebase Authentication no está disponible.', 'firebase-auth-unavailable');
    }
    const auth = fbase.getAuth();
    const user = auth?.currentUser;
    if (!user || user.isAnonymous || typeof user.getIdToken !== 'function') {
      throw createError('Inicia sesión nuevamente para continuar con Stripe.', 'stripe-auth-required');
    }
    return user.getIdToken(forceRefresh);
  }

  async function requestJson({ fbase, endpoint, method = 'POST', body = null, timeout = 30000 } = {}) {
    const token = await getFirebaseToken(fbase, false);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await global.fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try { data = JSON.parse(text); }
        catch (error) { data = { error: text.slice(0, 500) }; }
      }
      if (!response.ok || data.success === false) {
        const error = createError(
          data.error || `Stripe respondió HTTP ${response.status}.`,
          data.code || `stripe-http-${response.status}`,
          data.details || {}
        );
        error.httpStatus = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createError('La operación con Stripe tardó demasiado. Intenta nuevamente.', 'stripe-request-timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function generateRequestId() {
    const random = global.crypto?.getRandomValues
      ? Array.from(global.crypto.getRandomValues(new Uint8Array(8)))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
      : Math.random().toString(36).slice(2, 18);
    return `SWR-${Date.now()}-${random}`;
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  }

  async function getAdminConfig({ fbase } = {}) {
    const data = await requestJson({ fbase, endpoint: CONFIG_ENDPOINT, method: 'GET' });
    return data.config || {};
  }

  async function saveAdminConfig({ fbase, publishableKey = '', secretKey = '' } = {}) {
    const auth = fbase?.getAuth?.();
    const user = auth?.currentUser;
    const adminRefreshToken = clean(user?.refreshToken || '');
    if (!adminRefreshToken) {
      throw createError('No se pudo obtener la autorización del Panel de Control. Cierra sesión, vuelve a entrar y guarda nuevamente las claves.', 'stripe-admin-refresh-token-missing');
    }

    const data = await requestJson({
      fbase,
      endpoint: CONFIG_ENDPOINT,
      method: 'POST',
      body: {
        publishableKey: clean(publishableKey),
        secretKey: clean(secretKey),
        adminRefreshToken
      },
      timeout: 45000
    });
    return data.config || {};
  }

  async function createCheckout({ fbase, amount, requestId = '' } = {}) {
    const data = await requestJson({
      fbase,
      endpoint: CHECKOUT_ENDPOINT,
      method: 'POST',
      body: {
        amount: Number(amount),
        requestId: clean(requestId) || generateRequestId()
      },
      timeout: 45000
    });

    if (data.credited === true) return data;
    if (!data.publishableKey || !data.clientSecret || !data.checkoutSessionId) {
      throw createError('Stripe no devolvió una sesión segura para pagar.', 'stripe-checkout-data-missing');
    }
    return data;
  }

  async function confirmCheckout({ fbase, sessionId } = {}) {
    const cleanSessionId = clean(sessionId);
    if (!cleanSessionId) {
      throw createError('Falta la referencia de la recarga Stripe.', 'stripe-session-id-missing');
    }
    return requestJson({
      fbase,
      endpoint: STATUS_ENDPOINT,
      method: 'POST',
      body: { sessionId: cleanSessionId },
      timeout: 45000
    });
  }

  async function recoverPendingCheckouts({ fbase } = {}) {
    return requestJson({
      fbase,
      endpoint: STATUS_ENDPOINT,
      method: 'POST',
      body: { recoverPending: true },
      timeout: 60000
    });
  }

  function loadStripeJs() {
    if (typeof global.Stripe === 'function') return Promise.resolve(global.Stripe);
    if (stripeJsPromise) return stripeJsPromise;

    stripeJsPromise = new Promise((resolve, reject) => {
      const existing = global.document?.querySelector?.(`script[src="${STRIPE_JS_URL}"]`);
      const complete = () => {
        if (typeof global.Stripe === 'function') resolve(global.Stripe);
        else reject(createError('Stripe.js no pudo inicializarse.', 'stripe-js-unavailable'));
      };

      if (existing) {
        existing.addEventListener('load', complete, { once: true });
        existing.addEventListener('error', () => reject(createError('No se pudo cargar Stripe.js.', 'stripe-js-load-failed')), { once: true });
        return;
      }

      const script = global.document.createElement('script');
      script.src = STRIPE_JS_URL;
      script.async = true;
      script.onload = complete;
      script.onerror = () => reject(createError('No se pudo cargar Stripe.js.', 'stripe-js-load-failed'));
      global.document.head.appendChild(script);
    }).catch((error) => {
      stripeJsPromise = null;
      throw error;
    });

    return stripeJsPromise;
  }

  function makeElement(tag, className = '', text = '') {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createCheckoutModal(amount) {
    const previous = global.document.getElementById('drive-mx-stripe-wallet-modal');
    if (previous) previous.remove();

    const overlay = makeElement('div', 'fixed inset-0 z-[10000] bg-slate-950/70 overflow-y-auto p-3 sm:p-6');
    overlay.id = 'drive-mx-stripe-wallet-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Pago con tarjeta Stripe');

    const shell = makeElement('div', 'w-full max-w-3xl mx-auto my-2 sm:my-6 bg-white rounded-3xl shadow-2xl overflow-hidden');
    const header = makeElement('div', 'sticky top-0 z-10 flex items-start justify-between gap-4 px-5 sm:px-7 py-5 bg-white border-b border-slate-100');
    const titleWrap = makeElement('div');
    const eyebrow = makeElement('p', 'text-[9px] font-black uppercase tracking-widest text-red-500', 'Recarga de cartera');
    const title = makeElement('h2', 'text-xl sm:text-2xl font-black text-slate-900 mt-1', 'Pago seguro con tarjeta');
    const amountText = makeElement('p', 'text-sm font-black text-slate-500 mt-1', formatMoney(amount));
    titleWrap.append(eyebrow, title, amountText);

    const closeButton = makeElement('button', 'shrink-0 w-11 h-11 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 font-black text-xl', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Cerrar pago Stripe');
    header.append(titleWrap, closeButton);

    const content = makeElement('div', 'p-3 sm:p-6');
    const status = makeElement('p', 'px-4 py-3 mb-3 rounded-2xl bg-slate-50 text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-slate-500', 'Preparando el formulario seguro de Stripe...');
    const checkoutContainer = makeElement('div', 'min-h-[520px] w-full');
    const note = makeElement('p', 'px-4 pt-4 pb-2 text-[9px] font-bold uppercase leading-relaxed text-slate-400', 'El saldo se acredita únicamente después de que Stripe confirme el cobro. Cada recarga se registra en la cartera del usuario que inició sesión.');
    content.append(status, checkoutContainer, note);
    shell.append(header, content);
    overlay.appendChild(shell);
    global.document.body.appendChild(overlay);

    const previousBodyOverflow = global.document.body.style.overflow;
    global.document.body.style.overflow = 'hidden';

    return {
      overlay,
      shell,
      closeButton,
      checkoutContainer,
      status,
      restoreBody: () => { global.document.body.style.overflow = previousBodyOverflow; }
    };
  }

  async function createEmbeddedCheckoutInstance(stripe, clientSecret, onComplete) {
    if (typeof stripe?.createEmbeddedCheckoutPage === 'function') {
      return stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () => clientSecret,
        onComplete
      });
    }
    if (typeof stripe?.initEmbeddedCheckout === 'function') {
      return stripe.initEmbeddedCheckout({ clientSecret, onComplete });
    }
    throw createError('La versión cargada de Stripe.js no permite mostrar el pago integrado.', 'stripe-embedded-checkout-unavailable');
  }

  async function openEmbeddedCheckout({ fbase, amount, requestId = '' } = {}) {
    const checkoutData = await createCheckout({ fbase, amount, requestId });
    if (checkoutData.credited === true) return checkoutData;

    const StripeConstructor = await loadStripeJs();
    const modal = createCheckoutModal(checkoutData.amount || amount);
    let checkout = null;
    let pollingTimer = null;
    let finished = false;
    let closing = false;
    let resolveResult;
    let rejectResult;

    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const setStatus = (message, kind = 'neutral') => {
      modal.status.textContent = message;
      modal.status.className = 'px-4 py-3 mb-3 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-wide';
      if (kind === 'success') modal.status.className += ' bg-green-50 text-green-700';
      else if (kind === 'error') modal.status.className += ' bg-red-50 text-red-600';
      else if (kind === 'waiting') modal.status.className += ' bg-yellow-50 text-yellow-700';
      else modal.status.className += ' bg-slate-50 text-slate-500';
    };

    const cleanup = () => {
      if (pollingTimer) global.clearInterval(pollingTimer);
      pollingTimer = null;
      try { checkout?.destroy?.(); } catch (error) {}
      checkout = null;
      modal.restoreBody();
      modal.overlay.remove();
    };

    const finish = (result, error = null) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) rejectResult(error);
      else resolveResult(result || {});
    };

    let activeStatusCheck = null;
    const checkStatus = ({ finalCheck = false } = {}) => {
      if (finished) return Promise.resolve(null);
      if (activeStatusCheck) return activeStatusCheck;

      activeStatusCheck = (async () => {
        try {
          if (finalCheck) setStatus('Stripe confirmó el pago. Acreditando el saldo...', 'waiting');
          const result = await confirmCheckout({
            fbase,
            sessionId: checkoutData.checkoutSessionId
          });

          if (result.credited === true) {
            setStatus('Pago confirmado. El saldo fue acreditado correctamente.', 'success');
            await new Promise((resolve) => global.setTimeout(resolve, 500));
            finish(result);
            return result;
          }

          if (String(result.status || '').toLowerCase() === 'expirada' || result.sessionStatus === 'expired') {
            setStatus('La sesión de pago expiró sin realizar el cobro.', 'error');
            await new Promise((resolve) => global.setTimeout(resolve, 700));
            finish({ ...result, cancelled: true, expired: true });
            return result;
          }

          if (finalCheck) {
            setStatus('El pago está siendo confirmado. No cierres esta ventana.', 'waiting');
          }
          return result;
        } catch (error) {
          console.error('Confirmar recarga Stripe:', error);
          if (finalCheck) setStatus(error?.message || 'No se pudo confirmar todavía el pago.', 'error');
          return null;
        }
      })().finally(() => {
        activeStatusCheck = null;
      });

      return activeStatusCheck;
    };

    const closeModal = async () => {
      if (finished || closing) return;
      closing = true;
      modal.closeButton.disabled = true;
      setStatus('Verificando que no exista un pago confirmado...', 'waiting');
      await checkStatus({ finalCheck: false });
      if (!finished) finish({
        cancelled: true,
        credited: false,
        checkoutSessionId: checkoutData.checkoutSessionId,
        rechargeId: checkoutData.rechargeId,
        amount: checkoutData.amount || Number(amount || 0)
      });
    };

    modal.closeButton.addEventListener('click', closeModal);

    try {
      const stripe = StripeConstructor(checkoutData.publishableKey, { locale: 'es' });
      checkout = await createEmbeddedCheckoutInstance(
        stripe,
        checkoutData.clientSecret,
        () => { checkStatus({ finalCheck: true }); }
      );
      checkout.mount(modal.checkoutContainer);
      setStatus('Completa el pago. El saldo se acreditará al confirmarse el cobro.', 'neutral');
      pollingTimer = global.setInterval(() => { checkStatus({ finalCheck: false }); }, 3000);
      global.setTimeout(() => { checkStatus({ finalCheck: false }); }, 1200);
    } catch (error) {
      console.error('Abrir pago Stripe:', error);
      finish(null, error);
    }

    return resultPromise;
  }

  function createAdminStripeSettingsCard(React) {
    if (!React) return null;
    const h = React.createElement;
    const { useEffect, useState } = React;

    return function AdminStripeSettingsCard({ fbase, sessionUser } = {}) {
      const [config, setConfig] = useState({ configured: false, mode: '' });
      const [publishableKey, setPublishableKey] = useState('');
      const [secretKey, setSecretKey] = useState('');
      const [loading, setLoading] = useState(true);
      const [saving, setSaving] = useState(false);

      useEffect(() => {
        let active = true;
        if (sessionUser?.role !== 'admin') {
          setLoading(false);
          return undefined;
        }
        setLoading(true);
        getAdminConfig({ fbase })
          .then((next) => { if (active) setConfig(next || {}); })
          .catch((error) => {
            console.error('Cargar configuración Stripe:', error);
            if (active) setConfig({ configured: false, mode: '' });
          })
          .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
      }, [fbase, sessionUser?.role, sessionUser?.uid]);

      const submit = async (event) => {
        event?.preventDefault?.();
        if (saving) return;
        if (!config.configured && (!clean(publishableKey) || !clean(secretKey))) {
          alert('Ingresa la clave publicable y la clave secreta de Stripe.');
          return;
        }
        if (!clean(publishableKey) && !clean(secretKey)) {
          alert('Ingresa por lo menos una clave nueva para actualizar Stripe.');
          return;
        }

        setSaving(true);
        try {
          const next = await saveAdminConfig({ fbase, publishableKey, secretKey });
          setConfig(next || {});
          setPublishableKey('');
          setSecretKey('');
          alert('Las claves de Stripe se guardaron correctamente.');
        } catch (error) {
          console.error('Guardar configuración Stripe:', error);
          alert(error?.message || 'No se pudo guardar la configuración de Stripe.');
        } finally {
          setSaving(false);
        }
      };

      const modeLabel = config.mode === 'live'
        ? 'Producción'
        : (config.mode === 'test' ? 'Pruebas' : 'Sin configurar');
      const statusClass = config.configured
        ? 'bg-green-50 text-green-600'
        : 'bg-yellow-50 text-yellow-700';

      return h('div', { className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
          h('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3' },
            h('div', null,
              h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Pago con Tarjeta Stripe'),
              h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Configuración global para recargar individualmente la cartera de cada usuario')
            ),
            h('span', { className: `self-start px-3 py-1 rounded-full text-[8px] font-black uppercase ${statusClass}` }, config.configured ? `Activo · ${modeLabel}` : 'Pendiente de configuración')
          )
        ),
        h('form', { onSubmit: submit, className: 'p-6 grid md:grid-cols-2 gap-4' },
          loading ? h('p', { className: 'md:col-span-2 text-[10px] font-black uppercase text-slate-400' }, 'Consultando configuración Stripe...') : null,
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Clave publicable de Stripe'),
            h('input', {
              type: 'text',
              autoComplete: 'off',
              spellCheck: false,
              className: 'input-field font-mono',
              placeholder: config.publishableKeyMasked || 'pk_test_... o pk_live_...',
              value: publishableKey,
              onChange: (event) => setPublishableKey(event.target.value)
            }),
            config.publishableKeyMasked ? h('p', { className: 'mt-2 text-[9px] font-bold text-slate-400 break-all' }, `Guardada: ${config.publishableKeyMasked}`) : null
          ),
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Clave secreta de Stripe'),
            h('input', {
              type: 'password',
              autoComplete: 'new-password',
              spellCheck: false,
              className: 'input-field font-mono',
              placeholder: config.secretKeyMasked || 'sk_test_... o sk_live_...',
              value: secretKey,
              onChange: (event) => setSecretKey(event.target.value)
            }),
            config.secretKeyMasked ? h('p', { className: 'mt-2 text-[9px] font-bold text-slate-400 break-all' }, `Guardada: ${config.secretKeyMasked}`) : null
          ),
          h('p', { className: 'md:col-span-2 rounded-2xl bg-red-50 text-red-600 p-4 text-[9px] font-black uppercase leading-relaxed' }, 'Las dos claves se configuran únicamente desde este Panel de Control. La clave secreta se utiliza solamente en el servidor y nunca se entrega al navegador de los usuarios.'),
          h('button', {
            disabled: saving || loading,
            type: 'submit',
            className: 'md:col-span-2 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
          }, saving ? 'Validando y guardando...' : (config.configured ? 'Actualizar claves Stripe' : 'Guardar claves Stripe'))
        )
      );
    };
  }

  global.DriveMxStripeWallet = {
    available: true,
    getAdminConfig,
    saveAdminConfig,
    createCheckout,
    confirmCheckout,
    recoverPendingCheckouts,
    openEmbeddedCheckout,
    generateRequestId,
    AdminStripeSettingsCard: createAdminStripeSettingsCard(global.React)
  };
})(window);

