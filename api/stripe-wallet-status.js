'use strict';

const {
  clean,
  getDb,
  parseBody,
  verifyFirebaseUser,
  publicError,
  setCommonHeaders,
  sendError
} = require('../server/stripe/firebase-admin');
const {
  loadStripeConfig,
  createStripeClient,
  validateStripeSession,
  finalizePaidCheckout,
  markCheckoutStatus
} = require('../server/stripe/stripe-wallet');

module.exports = async function handler(req, res) {
  setCommonHeaders(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido.', code: 'method-not-allowed' });
  }

  try {
    const decoded = await verifyFirebaseUser(req);
    const body = parseBody(req);
    const sessionId = clean(body.sessionId);
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      throw publicError('La referencia de Stripe no es válida.', 400, 'invalid-stripe-session-id');
    }

    const db = getDb();
    const config = await loadStripeConfig(db);
    const stripe = createStripeClient(config);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const validated = validateStripeSession(session);
    if (validated.userId !== decoded.uid) {
      throw publicError('La recarga de Stripe pertenece a otro usuario.', 403, 'stripe-session-user-mismatch');
    }

    let result;
    if (session.payment_status === 'paid') {
      result = await finalizePaidCheckout({ db, session, source: 'return-status' });
    } else if (session.status === 'expired') {
      result = await markCheckoutStatus({ db, session, status: 'Expirada', source: 'return-status' });
    } else {
      result = {
        credited: false,
        status: session.payment_status || session.status || 'processing',
        userId: validated.userId,
        rechargeId: validated.rechargeId,
        amount: validated.amount
      };
    }

    return res.status(200).json({
      success: true,
      checkoutSessionId: session.id,
      paymentStatus: session.payment_status || '',
      checkoutStatus: session.status || '',
      ...result
    });
  } catch (error) {
    return sendError(res, error, 'No se pudo confirmar la recarga con Stripe.');
  }
};
