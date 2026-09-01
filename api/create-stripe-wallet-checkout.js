'use strict';

const {
  getBearerToken,
  decodeToken,
  parseBody,
  setCommonHeaders,
  sendError
} = require('../server/stripe/firebase-rest');
const { createWalletCheckout } = require('../server/stripe/stripe-wallet');

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
    const checkout = await createWalletCheckout({
      userToken,
      decoded,
      rawAmount: body.amount,
      requestId: body.requestId
    });
    return res.status(200).json({ success: true, ...checkout });
  } catch (error) {
    return sendError(res, error);
  }
};

