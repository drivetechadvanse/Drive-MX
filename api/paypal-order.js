const PAYPAL_API_BASE = (process.env.PAYPAL_ENV || '').toLowerCase() === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

const clean = (value = '') => String(value || '').trim();
const roundMoney = (value = 0) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const moneyClose = (a, b) => Math.abs(roundMoney(a) - roundMoney(b)) <= 0.01;
const sanitizeText = (value = '', max = 127) => clean(value).replace(/\s+/g, ' ').slice(0, max);

const getConfiguredClientId = (body = {}) => clean(process.env.PAYPAL_CLIENT_ID || body.clientId || body.paypalClientId);
const getConfiguredClientSecret = (body = {}) => clean(process.env.PAYPAL_CLIENT_SECRET || body.clientSecret || body.paypalClientSecret);

function extractProducts(body = {}) {
  const source = Array.isArray(body.products) && body.products.length > 0
    ? body.products
    : (body.product ? [body.product] : []);
  return source
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => ({
      id: sanitizeText(item.id || item.productId || '', 120),
      name: sanitizeText(item.name || item.productName || 'Producto Drive MX', 120),
      price: roundMoney(item.price ?? item.productCost ?? item.amount ?? 0)
    }))
    .filter((item) => item.id && item.name && item.price > 0);
}

function getExpectedTotal(body = {}) {
  const products = extractProducts(body);
  const productTotal = roundMoney(products.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const requestedTotal = roundMoney(body.total ?? body.amount ?? body.cart?.total ?? productTotal);
  if (!products.length) throw new Error('No hay productos válidos para cobrar con PayPal.');
  if (productTotal <= 0) throw new Error('El total de PayPal debe ser mayor a cero.');
  if (!moneyClose(productTotal, requestedTotal)) throw new Error('El total de PayPal no coincide con los productos seleccionados.');
  return { products, total: productTotal };
}

async function getAccessToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('Faltan credenciales PayPal Client ID / Secret.');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'PayPal no entregó token de acceso.');
  return data.access_token;
}

function summarizeCapture(order = {}, expectedTotal = 0) {
  const unit = Array.isArray(order.purchase_units) ? (order.purchase_units[0] || {}) : {};
  const captures = Array.isArray(unit.payments?.captures) ? unit.payments.captures : [];
  const capture = captures[0] || {};
  const amount = capture.amount || unit.amount || {};
  const summary = {
    orderId: clean(order.id),
    captureId: clean(capture.id),
    status: clean(capture.status || order.status),
    orderStatus: clean(order.status),
    currency: clean(amount.currency_code),
    value: roundMoney(amount.value || 0),
    payerEmail: clean(order.payer?.email_address).toLowerCase()
  };
  const completed = [summary.status, summary.orderStatus].some((status) => status.toUpperCase() === 'COMPLETED');
  if (!completed) throw new Error('PayPal no confirmó la captura del pago.');
  if (summary.currency !== 'MXN') throw new Error('PayPal confirmó una moneda distinta a MXN.');
  if (!moneyClose(summary.value, expectedTotal)) throw new Error('El monto capturado por PayPal no coincide con el total de la compra.');
  if (!summary.orderId || !summary.captureId) throw new Error('PayPal no devolvió identificadores válidos de orden/captura.');
  return summary;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método no permitido.' });
  try {
    const body = req.body || {};
    const action = clean(body.action);
    const clientId = getConfiguredClientId(body);
    const clientSecret = getConfiguredClientSecret(body);
    const token = await getAccessToken(clientId, clientSecret);

    if (action === 'create') {
      const { products, total } = getExpectedTotal(body);
      const description = sanitizeText(products.length > 1 ? `${products.length} productos Drive MX` : products[0].name, 127);
      const orderResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: sanitizeText(`drive_mx_${Date.now()}`, 127),
            description,
            custom_id: sanitizeText(products.map((item) => item.id).join('_'), 127),
            amount: { currency_code: 'MXN', value: total.toFixed(2) }
          }]
        })
      });
      const order = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok || !order.id) throw new Error(order.message || order.name || 'PayPal no pudo crear la orden.');
      return res.status(200).json({ success: true, orderId: order.id, total: total.toFixed(2) });
    }

    if (action === 'capture') {
      const orderId = clean(body.orderId);
      const expectedTotal = roundMoney(body.total ?? body.amount ?? body.cart?.total ?? 0);
      if (!orderId) throw new Error('Falta el ID de orden PayPal.');
      if (expectedTotal <= 0) throw new Error('El total esperado de PayPal no es válido.');
      const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        }
      });
      const capture = await captureResponse.json().catch(() => ({}));
      if (!captureResponse.ok) throw new Error(capture.message || capture.name || 'PayPal no pudo capturar la orden.');
      const paypalSummary = summarizeCapture(capture, expectedTotal);
      return res.status(200).json({ success: true, paypalSummary });
    }

    return res.status(400).json({ success: false, error: 'Acción PayPal no válida.' });
  } catch (error) {
    console.error('PayPal order API:', error);
    return res.status(400).json({ success: false, error: error.message || 'No se pudo procesar PayPal.' });
  }
};


