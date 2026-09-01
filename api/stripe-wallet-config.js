'use strict';

const {
  clean,
  lower,
  getBearerToken,
  decodeToken,
  getDoc,
  parseBody,
  setCommonHeaders,
  sendError,
  publicError,
  APP_ID,
  ADMIN_EMAIL
} = require('../server/stripe/firebase-rest');
const { loadStripeConfig, saveStripeConfig, publicConfig } = require('../server/stripe/stripe-wallet');

const ROOT = `artifacts/${APP_ID}/public/data`;

async function requireAdmin(token, decoded) {
  if (lower(decoded.email) === lower(ADMIN_EMAIL)) return;
  const profile = await getDoc(`${ROOT}/operators/${decoded.uid}`, token, { optional: true });
  if (!profile.exists || profile.data?.role !== 'admin') {
    throw publicError('Solo el administrador puede configurar Stripe.', 403, 'admin-required');
  }
}

module.exports = async function handler(req, res) {
  setCommonHeaders(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, code: 'method-not-allowed', error: 'Método no permitido.' });
  }

  try {
    const token = getBearerToken(req);
    const decoded = decodeToken(token);
    await requireAdmin(token, decoded);

    if (req.method === 'GET') {
      const config = await loadStripeConfig(token, { requireComplete: false });
      return res.status(200).json({ success: true, config: publicConfig(config) });
    }

    const body = parseBody(req);
    const config = await saveStripeConfig(token, {
      publishableKey: clean(body.publishableKey || ''),
      secretKey: clean(body.secretKey || ''),
      adminRefreshToken: clean(body.adminRefreshToken || ''),
      actor: clean(decoded.email || decoded.uid)
    });
    return res.status(200).json({ success: true, config });
  } catch (error) {
    return sendError(res, error);
  }
};

