'use strict';

const {
  ADMIN_EMAIL,
  clean,
  lower,
  getDb,
  parseBody,
  verifyFirebaseUser,
  getBaseUrl,
  setCommonHeaders,
  sendError
} = require('../server/stripe/firebase-admin');
const {
  loadStripeConfig,
  saveStripeConfig
} = require('../server/stripe/stripe-wallet');

module.exports = async function handler(req, res) {
  setCommonHeaders(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Método no permitido.', code: 'method-not-allowed' });
  }

  try {
    const decoded = await verifyFirebaseUser(req, { requireAdmin: true });
    const db = getDb();

    if (req.method === 'POST') {
      const body = parseBody(req);
      const saved = await saveStripeConfig(db, {
        secretKey: body.secretKey,
        webhookSecret: body.webhookSecret,
        actor: lower(decoded.email || ADMIN_EMAIL)
      });
      return res.status(200).json({
        success: true,
        config: {
          ...saved,
          webhookUrl: `${getBaseUrl(req).replace(/\/+$/, '')}/api/stripe-wallet-webhook`
        }
      });
    }

    const config = await loadStripeConfig(db, { requireComplete: false });
    return res.status(200).json({
      success: true,
      config: {
        configured: config.configured,
        mode: config.mode,
        updatedAt: config.updatedAt,
        updatedBy: clean(config.updatedBy),
        secretKeyMasked: config.secretKeyMasked,
        webhookSecretMasked: config.webhookSecretMasked,
        webhookUrl: `${getBaseUrl(req).replace(/\/+$/, '')}/api/stripe-wallet-webhook`
      }
    });
  } catch (error) {
    return sendError(res, error, 'No se pudo guardar la configuración de Stripe.');
  }
};
