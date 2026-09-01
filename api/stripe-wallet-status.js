'use strict';

const {
  clean,
  getBearerToken,
  decodeToken,
  parseBody,
  publicError,
  setCommonHeaders,
  sendError,
  refreshAdminIdToken
} = require('../server/stripe/firebase-rest');
const {
  loadStripeConfig,
  createStripeClient,
  retrieveSession,
  validateStripeSession,
  finalizePaidCheckout,
  markCheckoutStatus,
  recoverPaidCheckouts
} = require('../server/stripe/stripe-wallet');

module.exports = async function handler(req, res) {
  setCommonHeaders(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, code: 'method-not-allowed', error: 'Método no permitido.' });
  }

  try {
    const userToken = getBearerToken(req);
    const decoded = decodeToken(userToken);
    const body = parseBody(req);

    if (body.recoverPending === true) {
      const recovered = await recoverPaidCheckouts({ userToken, decoded });
      return res.status(200).json({ success: true, ...recovered });
    }

    const sessionId = clean(body.sessionId || body.checkoutSessionId || '');
    if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw publicError('La sesión de Stripe no es válida.', 400, 'invalid-stripe-session-id');
    }

    const config = await loadStripeConfig(userToken);
    const stripe = createStripeClient(config);
    const session = await retrieveSession(stripe, sessionId);
    const validated = validateStripeSession(session);

    if (validated.userId !== decoded.uid) {
      throw publicError('Esta recarga no pertenece al usuario autenticado.', 403, 'stripe-session-user-mismatch');
    }

    const adminToken = await refreshAdminIdToken(config.adminRefreshToken);

    if (session.payment_status === 'paid') {
      const result = await finalizePaidCheckout({ adminToken, session, source: 'embedded-checkout' });
      return res.status(200).json({ success: true, ...result });
    }

    if (session.status === 'expired') {
      const result = await markCheckoutStatus({ adminToken, session, status: 'Expirada', source: 'embedded-checkout' });
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(200).json({
      success: true,
      credited: false,
      status: session.payment_status || 'unpaid',
      sessionStatus: session.status || '',
      amount: validated.amount,
      rechargeId: validated.rechargeId
    });
  } catch (error) {
    return sendError(res, error);
  }
};

