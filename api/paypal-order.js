const https = require("https");

const CURRENCY = "MXN";

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return roundMoney(value).toFixed(2);
}

function moneyClose(left, right) {
  return Math.abs(roundMoney(left) - roundMoney(right)) <= 0.01;
}

function safeText(value = "", max = 127) {
  return clean(value).replace(/\s+/g, " ").slice(0, max);
}

function safeId(value = "") {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 127);
}

function httpFetch(url, options = {}) {
  if (typeof fetch === "function") return fetch(url, options);

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      target,
      {
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            json: async () => (text ? JSON.parse(text) : {}),
            text: async () => text,
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function getPayPalSettings(body = {}) {
  const requestSettings = body.paymentSettings || body.payload?.paymentSettings || {};
  const mode = lower(
    process.env.PAYPAL_ENV ||
      process.env.PAYPAL_MODE ||
      process.env.PAYPAL_ENVIRONMENT ||
      requestSettings.paypalEnvironment ||
      requestSettings.paypalMode ||
      "live"
  );

  return {
    clientId: clean(process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || requestSettings.paypalClientId),
    clientSecret: clean(process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET || requestSettings.paypalClientSecret),
    mode: mode === "sandbox" ? "sandbox" : "live",
    baseUrl: mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com",
  };
}

function assertPayPalSettings(settings) {
  if (!settings.clientId || !settings.clientSecret) {
    const error = new Error("Falta configurar PayPal Client ID y Secret en variables de entorno o en la solicitud.");
    error.statusCode = 400;
    throw error;
  }
}

function getOrderProducts(payload = {}) {
  const source = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : payload.product ? [payload.product] : [];
  return source.filter(Boolean).slice(0, 2).map((product) => ({
    id: clean(product.id),
    name: clean(product.name),
    price: roundMoney(product.price || 0),
  })).filter((product) => product.id && product.name && product.price > 0);
}

function getExpectedTotal(payload = {}) {
  const products = getOrderProducts(payload);
  const productTotal = roundMoney(products.reduce((sum, product) => sum + product.price, 0));
  const payloadTotal = roundMoney(payload.cart?.total || productTotal);
  if (productTotal > 0 && payloadTotal > 0 && !moneyClose(productTotal, payloadTotal)) {
    const error = new Error("El total de la compra no coincide con los productos seleccionados.");
    error.statusCode = 409;
    throw error;
  }
  if (payloadTotal <= 0) {
    const error = new Error("El total de PayPal debe ser mayor a cero.");
    error.statusCode = 400;
    throw error;
  }
  return payloadTotal;
}

async function getPayPalAccessToken(settings) {
  const response = await httpFetch(`${settings.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "PayPal no entregó token de acceso.");
    error.statusCode = response.status >= 500 ? 502 : response.status || 502;
    throw error;
  }
  return data.access_token;
}

async function payPalRequest(settings, path, { method = "GET", body, headers = {} } = {}) {
  const accessToken = await getPayPalAccessToken(settings);
  const response = await httpFetch(`${settings.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.details?.[0]?.description || data?.message || data?.name || "PayPal rechazó la operación.";
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : response.status || 502;
    error.paypal = data;
    throw error;
  }
  return data;
}

function getCaptureSummary(capture = {}) {
  const purchaseUnit = Array.isArray(capture.purchase_units) ? capture.purchase_units[0] || {} : {};
  const payments = purchaseUnit.payments || {};
  const captures = Array.isArray(payments.captures) ? payments.captures : [];
  const firstCapture = captures[0] || {};
  const amount = firstCapture.amount || purchaseUnit.amount || {};
  return {
    orderID: clean(capture.id),
    captureID: clean(firstCapture.id || capture.id),
    status: clean(firstCapture.status || capture.status),
    orderStatus: clean(capture.status),
    currency: clean(amount.currency_code || CURRENCY),
    value: roundMoney(amount.value || 0),
    payerEmail: clean(capture.payer?.email_address).toLowerCase(),
  };
}

function assertCompletedCapture(summary, expectedTotal) {
  const completed = [summary.status, summary.orderStatus].some((status) => lower(status) === "completed");
  if (!completed) {
    const error = new Error("PayPal no confirmó la captura del pago.");
    error.statusCode = 409;
    throw error;
  }
  if (summary.currency !== CURRENCY || !moneyClose(summary.value, expectedTotal)) {
    const error = new Error("El monto capturado por PayPal no coincide con el total de la compra.");
    error.statusCode = 409;
    throw error;
  }
}

async function createPayPalOrder(settings, payload = {}) {
  const products = getOrderProducts(payload);
  if (products.length === 0) {
    const error = new Error("Faltan datos del producto.");
    error.statusCode = 400;
    throw error;
  }
  const total = getExpectedTotal(payload);
  const order = await payPalRequest(settings, "/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": safeId(`drive_mx_create_${Date.now()}_${total}`) },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: safeId(`drive_mx_${Date.now()}`),
          description: safeText(products.length > 1 ? `${products.length} productos Drive MX` : products[0].name),
          custom_id: safeId(products.map((product) => product.id).join("_")),
          amount: {
            currency_code: CURRENCY,
            value: money(total),
          },
        },
      ],
    },
  });

  return { orderID: order.id, paypalOrderId: order.id, amount: money(total), currency: CURRENCY };
}

async function capturePayPalOrder(settings, orderID, payload = {}) {
  const paypalOrderId = clean(orderID);
  if (!paypalOrderId) {
    const error = new Error("Falta el ID de la orden PayPal.");
    error.statusCode = 400;
    throw error;
  }
  const expectedTotal = getExpectedTotal(payload);
  let capture;
  try {
    capture = await payPalRequest(settings, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": safeId(`drive_mx_capture_${paypalOrderId}`) },
      body: {},
    });
  } catch (error) {
    if (lower(error.paypal?.name) !== "unprocessable_entity" && !lower(error.message).includes("already")) throw error;
    capture = await payPalRequest(settings, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  }
  const summary = getCaptureSummary(capture);
  assertCompletedCapture(summary, expectedTotal);
  return {
    orderID: paypalOrderId,
    captureID: summary.captureID,
    paypalStatus: summary.status || summary.orderStatus,
    paypalPayerEmail: summary.payerEmail,
    amount: money(summary.value),
    currency: summary.currency,
    alreadyRecorded: false,
    sales: [],
    emailWarning: "",
    saleNotificationError: "",
  };
}

function sendCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  sendCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido." });
  }

  try {
    const body = req.body || {};
    const settings = getPayPalSettings(body);

    if (req.method === "GET" || body.action === "config" || req.query?.action === "config") {
      return res.status(200).json({
        success: true,
        paypalClientId: settings.clientId,
        paypalConfigured: Boolean(settings.clientId && settings.clientSecret),
        paypalEnvironment: settings.mode,
      });
    }

    assertPayPalSettings(settings);

    if (body.action === "create") {
      const result = await createPayPalOrder(settings, body.payload || {});
      return res.status(200).json({ success: true, ...result });
    }

    if (body.action === "capture") {
      const result = await capturePayPalOrder(settings, body.orderID || body.paypalOrderId, body.payload || {});
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(400).json({ success: false, error: "Acción PayPal no válida." });
  } catch (error) {
    console.error("PayPal order error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "No se pudo procesar PayPal.",
    });
  }
};



