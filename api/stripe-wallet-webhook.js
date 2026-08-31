'use strict';

const {
  clean,
  getDb,
  publicError,
  setCommonHeaders,
  sendError
} = require('../server/stripe/firebase-admin');
const {
  loadStripeConfig,
  createStripeClient,
  finalizePaidCheckout,
  markCheckoutStatus,
  rememberWebhookEvent
} = require('../server/stripe/stripe-wallet');

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function asExactBodyBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (!req || typeof req.on !== 'function' || req.readableEnded || req.destroyed || req.readable === false) {
      resolve(null);
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > MAX_WEBHOOK_BYTES) {
        finish(reject, publicError('El webhook de Stripe supera el tamaño permitido.', 413, 'stripe-webhook-too-large'));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish(resolve, Buffer.concat(chunks));
    const onError = (error) => finish(reject, error);
    const onAborted = () => finish(reject, publicError('La solicitud del webhook fue interrumpida.', 400, 'stripe-webhook-aborted'));

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

function verifySignedEvent(stripe, rawBody, signature, webhookSecret) {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[Stripe][Webhook] Firma no válida.', error);
    throw publicError('La firma del webhook de Stripe no es válida.', 400, 'stripe-signature-invalid');
  }
}

async function retrieveEventFromStripe(stripe, parsedBody) {
  const eventId = clean(parsedBody?.id);
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) {
    throw publicError('El webhook no contiene una referencia válida de Stripe.', 400, 'stripe-event-id-invalid');
  }

  try {
    const event = await stripe.events.retrieve(eventId);
    if (!event?.id || event.id !== eventId || event.object !== 'event') {
      throw new Error('Stripe devolvió un evento distinto al solicitado.');
    }
    return event;
  } catch (error) {
    console.error('[Stripe][Webhook] No se pudo recuperar el evento original.', error);
    throw publicError('Stripe no pudo validar el evento recibido.', 400, 'stripe-event-retrieval-failed');
  }
}

async function getVerifiedEvent({ req, stripe, signature, webhookSecret }) {
  const explicitRawBody = asExactBodyBuffer(req?.rawBody);
  if (explicitRawBody) {
    return verifySignedEvent(stripe, explicitRawBody, signature, webhookSecret);
  }

  const bodyBuffer = asExactBodyBuffer(req?.body);
  if (bodyBuffer) {
    return verifySignedEvent(stripe, bodyBuffer, signature, webhookSecret);
  }

  // Algunas plataformas entregan req.body ya convertido a objeto. En ese caso
  // no se reconstruye el JSON porque dejaría de ser el cuerpo exacto firmado.
  // Se recupera el evento por su ID directamente desde la API autenticada de Stripe.
  if (req?.body && typeof req.body === 'object') {
    return retrieveEventFromStripe(stripe, req.body);
  }

  const streamedBody = await readRawBody(req);
  if (streamedBody?.length) {
    return verifySignedEvent(stripe, streamedBody, signature, webhookSecret);
  }

  throw publicError('No se recibió el contenido del webhook de Stripe.', 400, 'stripe-webhook-body-missing');
}

async function getCanonicalCheckoutSession(stripe, event) {
  const sessionFromEvent = event?.data?.object || {};
  const sessionId = clean(sessionFromEvent.id);
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    throw publicError('El evento de Stripe no contiene una sesión de pago válida.', 400, 'invalid-stripe-session-id');
  }

  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error('[Stripe][Webhook] No se pudo recuperar la sesión de Checkout.', error);
    throw publicError('Stripe no pudo confirmar la sesión de pago.', 400, 'stripe-session-retrieval-failed');
  }
}

async function handler(req, res) {
  setCommonHeaders(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido.', code: 'method-not-allowed' });
  }

  try {
    const db = getDb();
    const config = await loadStripeConfig(db);
    const stripe = createStripeClient(config);
    const signature = clean(req.headers?.['stripe-signature']);
    if (!signature) {
      throw publicError('Falta la firma del webhook de Stripe.', 400, 'stripe-signature-missing');
    }

    const event = await getVerifiedEvent({
      req,
      stripe,
      signature,
      webhookSecret: config.webhookSecret
    });

    let result = { ignored: true, eventType: event.type };
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded' ||
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = await getCanonicalCheckoutSession(stripe, event);
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        result = await finalizePaidCheckout({ db, session, source: `webhook:${event.type}` });
      } else if (event.type === 'checkout.session.expired') {
        result = await markCheckoutStatus({ db, session, status: 'Expirada', source: `webhook:${event.type}` });
      } else {
        result = await markCheckoutStatus({ db, session, status: 'Fallida', source: `webhook:${event.type}` });
      }
    }

    await rememberWebhookEvent(db, event, result);
    return res.status(200).json({ received: true });
  } catch (error) {
    return sendError(res, error, 'No se pudo procesar el webhook de Stripe.');
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
