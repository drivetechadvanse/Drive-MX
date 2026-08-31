'use strict';

const {
  getDb,
  parseBody,
  verifyFirebaseUser,
  getBaseUrl,
  setCommonHeaders,
  sendError
} = require('../server/stripe/firebase-admin');
const { createWalletCheckout } = require('../server/stripe/stripe-wallet');

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
    const result = await createWalletCheckout({
      db: getDb(),
      decoded,
      rawAmount: body.amount,
      requestId: body.requestId,
      baseUrl: getBaseUrl(req)
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'No se pudo iniciar el pago con tarjeta Stripe.');
  }
};
