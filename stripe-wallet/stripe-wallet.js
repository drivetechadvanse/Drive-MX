(function (global) {
  'use strict';

  const CONFIG_ENDPOINT = '/api/stripe-wallet-config';
  const CHECKOUT_ENDPOINT = '/api/create-stripe-wallet-checkout';
  const STATUS_ENDPOINT = '/api/stripe-wallet-status';
  const RETURN_STATUS_PARAM = 'stripe_wallet';
  const RETURN_SESSION_PARAM = 'session_id';

  const clean = (value) => String(value ?? '').trim();

  function createError(message, code = 'stripe-wallet-error', details = {}) {
    const error = new Error(message || 'No se pudo completar la operación con Stripe.');
    error.code = code;
    error.details = details;
    return error;
  }

  async function getFirebaseToken(fbase, forceRefresh = true) {
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
    const token = await getFirebaseToken(fbase, true);
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
        const error = createError(data.error || `Stripe respondió HTTP ${response.status}.`, data.code || `stripe-http-${response.status}`, data.details || {});
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
      ? Array.from(global.crypto.getRandomValues(new Uint8Array(8))).map((value) => value.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(36).slice(2, 18);
    return `SWR-${Date.now()}-${random}`;
  }

  async function getAdminConfig({ fbase } = {}) {
    const data = await requestJson({ fbase, endpoint: CONFIG_ENDPOINT, method: 'GET' });
    return data.config || {};
  }

  async function saveAdminConfig({ fbase, secretKey = '', webhookSecret = '' } = {}) {
    const data = await requestJson({
      fbase,
      endpoint: CONFIG_ENDPOINT,
      method: 'POST',
      body: { secretKey: clean(secretKey), webhookSecret: clean(webhookSecret) },
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
    if (!data.checkoutUrl) {
      throw createError('Stripe no devolvió la página segura para pagar.', 'stripe-checkout-url-missing');
    }
    return data;
  }

  async function confirmCheckout({ fbase, sessionId } = {}) {
    const cleanSessionId = clean(sessionId);
    if (!cleanSessionId) throw createError('Falta la referencia de la recarga Stripe.', 'stripe-session-id-missing');
    return requestJson({
      fbase,
      endpoint: STATUS_ENDPOINT,
      method: 'POST',
      body: { sessionId: cleanSessionId },
      timeout: 45000
    });
  }

  function getReturnState() {
    try {
      const params = new URLSearchParams(global.location.search || '');
      const status = clean(params.get(RETURN_STATUS_PARAM)).toLowerCase();
      if (!status) return null;
      return {
        status,
        sessionId: clean(params.get(RETURN_SESSION_PARAM))
      };
    } catch (error) {
      return null;
    }
  }

  function clearReturnState() {
    try {
      const url = new URL(global.location.href);
      url.searchParams.delete(RETURN_STATUS_PARAM);
      url.searchParams.delete(RETURN_SESSION_PARAM);
      global.history.replaceState(global.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {}
  }

  function createAdminStripeSettingsCard(React) {
    if (!React) return null;
    const h = React.createElement;
    const { useEffect, useState } = React;

    return function AdminStripeSettingsCard({ fbase, sessionUser } = {}) {
      const [config, setConfig] = useState({ configured: false, mode: '', webhookUrl: '' });
      const [secretKey, setSecretKey] = useState('');
      const [webhookSecret, setWebhookSecret] = useState('');
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
            if (active) setConfig({ configured: false, mode: '', webhookUrl: '' });
          })
          .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
      }, [fbase, sessionUser?.role, sessionUser?.uid]);

      const submit = async (event) => {
        event?.preventDefault?.();
        if (saving) return;
        if (!config.configured && (!clean(secretKey) || !clean(webhookSecret))) {
          alert('Ingresa la clave secreta de Stripe y el secreto de firma del webhook.');
          return;
        }
        if (!clean(secretKey) && !clean(webhookSecret)) {
          alert('Ingresa por lo menos una clave nueva para actualizar Stripe.');
          return;
        }
        setSaving(true);
        try {
          const next = await saveAdminConfig({ fbase, secretKey, webhookSecret });
          setConfig(next || {});
          setSecretKey('');
          setWebhookSecret('');
          alert('Configuración de Stripe guardada correctamente.');
        } catch (error) {
          console.error('Guardar configuración Stripe:', error);
          alert(error?.message || 'No se pudo guardar la configuración de Stripe.');
        } finally {
          setSaving(false);
        }
      };

      const modeLabel = config.mode === 'live' ? 'Producción' : (config.mode === 'test' ? 'Pruebas' : 'Sin configurar');
      const statusClass = config.configured ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700';

      return h('div', { className: 'card-glass overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
          h('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3' },
            h('div', null,
              h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Pago con Tarjeta Stripe'),
              h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Configuración global para recargar la cartera individual de cada usuario')
            ),
            h('span', { className: `self-start px-3 py-1 rounded-full text-[8px] font-black uppercase ${statusClass}` }, config.configured ? `Activo · ${modeLabel}` : 'Pendiente de configuración')
          )
        ),
        h('form', { onSubmit: submit, className: 'p-6 grid md:grid-cols-1 gap-4' },
          loading ? h('p', { className: 'text-[10px] font-black uppercase text-slate-400' }, 'Consultando configuración segura...') : null,
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Clave secreta de Stripe'),
            h('input', {
              type: 'password',
              autoComplete: 'new-password',
              className: 'input-field',
              placeholder: config.secretKeyMasked || 'sk_test_... o sk_live_...',
              value: secretKey,
              onChange: (event) => setSecretKey(event.target.value)
            }),
            config.secretKeyMasked ? h('p', { className: 'mt-2 text-[9px] font-bold text-slate-400' }, `Guardada: ${config.secretKeyMasked}`) : null
          ),
          h('div', null,
            h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Secreto de firma del webhook'),
            h('input', {
              type: 'password',
              autoComplete: 'new-password',
              className: 'input-field',
              placeholder: config.webhookSecretMasked || 'whsec_...',
              value: webhookSecret,
              onChange: (event) => setWebhookSecret(event.target.value)
            }),
            config.webhookSecretMasked ? h('p', { className: 'mt-2 text-[9px] font-bold text-slate-400' }, `Guardado: ${config.webhookSecretMasked}`) : null
          ),
          h('div', { className: 'rounded-2xl border border-slate-100 bg-slate-50 p-4' },
            h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2' }, 'Dirección del webhook para Stripe'),
            h('p', { className: 'text-[10px] font-mono font-bold text-slate-700 break-all select-all' }, config.webhookUrl || `${global.location.origin}/api/stripe-wallet-webhook`),
            h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase leading-relaxed mt-2' }, 'Registra esta dirección en Stripe para el evento checkout.session.completed y copia aquí el secreto whsec_.')
          ),
          h('p', { className: 'rounded-2xl bg-red-50 text-red-600 p-4 text-[9px] font-black uppercase leading-relaxed' }, 'Las claves se envían al servidor y no se guardan en el código público ni en la configuración visible de Firebase.'),
          h('button', {
            disabled: saving || loading,
            type: 'submit',
            className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
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
    getReturnState,
    clearReturnState,
    generateRequestId,
    AdminStripeSettingsCard: createAdminStripeSettingsCard(global.React)
  };
})(window);
