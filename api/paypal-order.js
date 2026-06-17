const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const DEFAULT_APP_ID = process.env.DRIVE_MX_APP_ID || "drivemx-paqueteria";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@drivemx.com";
const PUBLIC_PRODUCTS_COLLECTION = "products";
const ADMIN_PRODUCTS_COLLECTION = "admin_products";
const USER_PRODUCTS_COLLECTION = "user_products";
const USER_SALES_COLLECTION = "user_sales";
const COMPLETED_SALES_COLLECTION = "completed_sales";
const ORDERS_COLLECTION = "orders";
const WALLETS_COLLECTION = "wallets";
const WALLET_SETTINGS_COLLECTION = "wallet_settings";
const WALLET_COMMISSIONS_COLLECTION = "wallet_commissions";
const MOVEMENTS_COLLECTION = "movements";
const SETTINGS_DOC_ID = "config";
const CURRENCY = "MXN";
const CART_MAX_ITEMS = 2;
const SALE_NOTIFICATION_MESSAGE =
  "Tu producto ha sido vendido. Comunícate al 5633535701 o 5617549756 para la recolección de tu paquete.";
const INSUFFICIENT_MESSAGE =
  "Tu saldo es insuficiente para continuar utilizando la plataforma. Realiza una nueva recarga para seguir publicando y vendiendo.";

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

function moneyClose(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= 0.01;
}

function safeDocId(value = "") {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeList(...values) {
  const source = values.flatMap((value) => (Array.isArray(value) ? value : value ? String(value).split(",") : []));
  const seen = new Set();
  return source
    .map((item) => clean(item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizePercent(value) {
  const percent = Number(value || 0);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, roundMoney(percent)));
}

function calculateCommission(amount, percent) {
  return roundMoney((Number(amount || 0) * normalizePercent(percent)) / 100);
}

function basicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function decodeServiceAccount(value = "") {
  const raw = clean(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch (error) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY no es un JSON/base64 válido.");
    }
  }
}

function getFirebaseCredentialConfig() {
  const serviceAccount = decodeServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "");
  if (serviceAccount) return serviceAccount;

  const projectId = clean(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = clean(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
  }

  return null;
}

function ensureAdmin() {
  if (admin.apps.length) return admin.app();
  const credentialConfig = getFirebaseCredentialConfig();
  if (credentialConfig) {
    return admin.initializeApp({ credential: admin.credential.cert(credentialConfig) });
  }
  return admin.initializeApp();
}

function getRoot(db) {
  return db.collection("artifacts").doc(DEFAULT_APP_ID).collection("public").doc("data");
}

async function readConfig(root, collectionName) {
  const snap = await root.collection(collectionName).doc(SETTINGS_DOC_ID).get();
  return snap.exists ? snap.data() || {} : {};
}

async function readPaymentSettings(root) {
  const firestoreSettings = await readConfig(root, "payment_settings");
  const clientId = clean(process.env.PAYPAL_CLIENT_ID || firestoreSettings.paypalClientId);
  const clientSecret = clean(process.env.PAYPAL_CLIENT_SECRET || firestoreSettings.paypalClientSecret);
  const mode = lower(process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || firestoreSettings.paypalEnvironment || firestoreSettings.paypalMode || "live");

  return {
    bankAccount: clean(firestoreSettings.bankAccount),
    clientId,
    clientSecret,
    mode: mode === "sandbox" ? "sandbox" : "live",
    baseUrl: mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com",
  };
}

async function readMailSettings(root) {
  const firestoreSettings = await readConfig(root, "mail_settings");
  return {
    senderEmail: clean(process.env.GMAIL_SENDER_EMAIL || firestoreSettings.senderEmail),
    appPassword: clean(process.env.GMAIL_APP_PASSWORD || firestoreSettings.appPassword),
    receiverEmail: clean(process.env.ORDER_RECEIVER_EMAIL || firestoreSettings.receiverEmail),
  };
}

function assertPaypalConfig(settings) {
  if (!settings.clientId || !settings.clientSecret) {
    const error = new Error("Falta configurar PayPal Client ID y Secret en el Panel Admin.");
    error.statusCode = 400;
    throw error;
  }
}

function assertMailConfig(settings) {
  if (!settings.senderEmail || !settings.appPassword || !settings.receiverEmail) {
    const error = new Error("Falta configurar el correo remitente, contraseña de aplicación o correo base receptor.");
    error.statusCode = 400;
    throw error;
  }
  if (!isValidEmail(settings.senderEmail) || !isValidEmail(settings.receiverEmail)) {
    const error = new Error("La configuración de correo contiene direcciones inválidas.");
    error.statusCode = 400;
    throw error;
  }
}

function createTransporter(mailSettings) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: mailSettings.senderEmail,
      pass: mailSettings.appPassword,
    },
  });
}

function extractPayloadProducts(payload = {}) {
  const source = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : payload.product ? [payload.product] : [];
  return source.filter(Boolean).slice(0, CART_MAX_ITEMS + 1);
}

function getDelivery(payload = {}) {
  return payload.delivery && typeof payload.delivery === "object" ? payload.delivery : {};
}

function validateDelivery(delivery = {}) {
  const requiredDelivery = {
    street: "Calle",
    state: "Estado",
    municipality: "Municipio",
    neighborhood: "Colonia",
    zip: "Código Postal",
    fullName: "Nombre completo",
    phone: "Teléfono",
    email: "Correo electrónico",
    references: "Referencias del domicilio",
  };

  for (const [key, label] of Object.entries(requiredDelivery)) {
    if (!clean(delivery[key])) {
      const error = new Error(`Falta el campo: ${label}.`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (!isValidEmail(delivery.email)) {
    const error = new Error("Ingresa un correo electrónico válido.");
    error.statusCode = 400;
    throw error;
  }
}

function getProductSellerId(product = {}) {
  return clean(product.ownerId || product.sellerId || product.userId || product.createdByUid || "");
}

function isUserProduct(product = {}) {
  const sellerId = getProductSellerId(product);
  const type = lower(product.publicationType || product.productOrigin || product.sourcePanel || product.createdFromPanel || "");
  return Boolean(sellerId || type === "usuario" || type === "user" || type === "panel_usuario" || type === "panel-usuario");
}

async function getSellerInfo(root, product = {}) {
  const sellerId = getProductSellerId(product);
  let profile = {};
  if (sellerId) {
    const profileSnap = await root.collection("operators").doc(safeDocId(sellerId)).get();
    if (profileSnap.exists) profile = { id: profileSnap.id, ...profileSnap.data() };
  }

  return {
    id: sellerId || clean(profile.id || profile.uid),
    name: clean(profile.name || product.ownerName || product.sellerName || "Admin Central"),
    email: clean(profile.email || product.ownerEmail || product.sellerEmail || ADMIN_EMAIL).toLowerCase(),
    phone: clean(profile.phone || product.ownerPhone || product.sellerPhone || "-"),
    saleNotificationEmail: clean(
      profile.saleNotificationEmail ||
        product.sellerNotificationEmail ||
        product.saleNotificationEmail ||
        product.notificationEmail ||
        product.ownerNotificationEmail ||
        profile.email ||
        product.ownerEmail ||
        ""
    ),
  };
}

async function normalizeOrderPayload(root, payload = {}) {
  const requestedProducts = extractPayloadProducts(payload);
  const delivery = getDelivery(payload);
  validateDelivery(delivery);

  if (requestedProducts.length === 0) {
    const error = new Error("Faltan datos del producto.");
    error.statusCode = 400;
    throw error;
  }

  if (requestedProducts.length > CART_MAX_ITEMS) {
    const error = new Error("El carrito permite máximo 2 productos por compra.");
    error.statusCode = 400;
    throw error;
  }

  const productIds = requestedProducts.map((item) => clean(item.id));
  if (productIds.some((id) => !id)) {
    const error = new Error("Falta el ID de uno o más productos.");
    error.statusCode = 400;
    throw error;
  }

  if (new Set(productIds.map((id) => id.toLowerCase())).size !== productIds.length) {
    const error = new Error("No se permiten productos duplicados en la misma compra.");
    error.statusCode = 400;
    throw error;
  }

  const products = [];
  for (const requested of requestedProducts) {
    const productId = clean(requested.id);
    const snap = await root.collection(PUBLIC_PRODUCTS_COLLECTION).doc(productId).get();
    const source = snap.exists ? { id: snap.id, ...snap.data() } : { ...requested, id: productId };

    if (!source.id || !clean(source.name)) {
      const error = new Error("No se encontró uno de los productos seleccionados.");
      error.statusCode = 404;
      throw error;
    }

    if (source.active === false) {
      const error = new Error(`El producto ${source.name} ya no está disponible.`);
      error.statusCode = 409;
      throw error;
    }

    const stock = Number(source.stock ?? requested.stock ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      const error = new Error(`El producto ${source.name} no tiene inventario disponible.`);
      error.statusCode = 409;
      throw error;
    }

    const sourcePrice = roundMoney(source.price);
    const requestedPrice = roundMoney(requested.price);
    if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) {
      const error = new Error(`El producto ${source.name} no tiene precio válido.`);
      error.statusCode = 409;
      throw error;
    }

    if (requestedPrice > 0 && !moneyClose(sourcePrice, requestedPrice)) {
      const error = new Error(`El precio de ${source.name} cambió. Reinicia la compra para continuar.`);
      error.statusCode = 409;
      throw error;
    }

    const seller = await getSellerInfo(root, source);
    const sizes = normalizeList(source.sizes, source.tallas, requested.sizes, requested.tallas);
    const colors = normalizeList(source.colors, source.colores, source.color, requested.colors, requested.colores, requested.color);

    products.push({
      id: source.id,
      name: clean(source.name),
      price: sourcePrice,
      sizes,
      tallas: sizes,
      colors,
      colores: colors,
      stock,
      active: source.active !== false,
      sourcePanel: clean(source.sourcePanel),
      publicationType: clean(source.publicationType),
      productOrigin: clean(source.productOrigin),
      ownerId: seller.id,
      ownerName: seller.name,
      ownerEmail: seller.email,
      ownerPhone: seller.phone,
      sellerNotificationEmail: seller.saleNotificationEmail,
      saleNotificationEmail: seller.saleNotificationEmail,
      isUserProduct: isUserProduct(source),
    });
  }

  const total = roundMoney(products.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const payloadTotal = Number(payload.cart?.total ?? total);
  if (Number.isFinite(payloadTotal) && !moneyClose(payloadTotal, total)) {
    const error = new Error("El total de la compra cambió. Reinicia la compra para continuar.");
    error.statusCode = 409;
    throw error;
  }

  return {
    products,
    product: products[0],
    cart: {
      itemCount: products.length,
      maxItems: CART_MAX_ITEMS,
      total,
      expiresInMinutes: Number(payload.cart?.expiresInMinutes || 30),
    },
    delivery: {
      street: clean(delivery.street),
      state: clean(delivery.state),
      municipality: clean(delivery.municipality),
      neighborhood: clean(delivery.neighborhood),
      zip: clean(delivery.zip),
      fullName: clean(delivery.fullName),
      phone: clean(delivery.phone),
      email: clean(delivery.email).toLowerCase(),
      references: clean(delivery.references),
    },
  };
}

function groupProductsBySeller(products = []) {
  const groups = new Map();
  for (const product of products) {
    if (!product.isUserProduct) continue;
    const sellerId = safeDocId(getProductSellerId(product));
    if (!sellerId) continue;
    const current = groups.get(sellerId) || { sellerId, products: [], total: 0 };
    current.products.push(product);
    current.total = roundMoney(current.total + Number(product.price || 0));
    groups.set(sellerId, current);
  }
  return Array.from(groups.values());
}

function getMinimumRecharge(settings = {}) {
  const value = Number(settings.minimumWalletRecharge ?? settings.minimumFirstRecharge ?? settings.minimumRecharge ?? 500);
  return Number.isFinite(value) && value > 0 ? roundMoney(value) : 500;
}

function isWalletActivated(wallet = {}, settings = {}) {
  const minimumRecharge = getMinimumRecharge(settings);
  return Boolean(
    wallet.activated === true ||
      wallet.firstRechargeCompleted === true ||
      Number(wallet.rechargeCount || 0) > 0 ||
      Number(wallet.totalRecharged || 0) >= minimumRecharge
  );
}

async function validateWalletsBeforePayment(root, products = []) {
  const settings = await readConfig(root, WALLET_SETTINGS_COLLECTION);
  const percent = normalizePercent(settings.globalCommissionPercent ?? settings.commissionPercent ?? 0);
  const groups = groupProductsBySeller(products);

  for (const group of groups) {
    const commissionAmount = calculateCommission(group.total, percent);
    const walletSnap = await root.collection(WALLETS_COLLECTION).doc(group.sellerId).get();
    const wallet = walletSnap.exists ? { id: walletSnap.id, ...walletSnap.data() } : null;
    if (!wallet || !isWalletActivated(wallet, settings) || (commissionAmount > 0 && roundMoney(wallet.balance || 0) < commissionAmount)) {
      const error = new Error(INSUFFICIENT_MESSAGE);
      error.statusCode = 409;
      throw error;
    }
  }

  return { percent, settings };
}

async function getPayPalAccessToken(paypalSettings) {
  const response = await fetch(`${paypalSettings.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(paypalSettings.clientId, paypalSettings.clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "PayPal no entregó token de acceso.");
    error.statusCode = 502;
    throw error;
  }

  return data.access_token;
}

async function paypalRequest(paypalSettings, path, { method = "GET", body, headers = {} } = {}) {
  const accessToken = await getPayPalAccessToken(paypalSettings);
  const response = await fetch(`${paypalSettings.baseUrl}${path}`, {
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
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.paypal = data;
    throw error;
  }
  return data;
}

function getCaptureInfo(capture = {}) {
  const purchaseUnit = Array.isArray(capture.purchase_units) ? capture.purchase_units[0] || {} : {};
  const payments = purchaseUnit.payments || {};
  const captures = Array.isArray(payments.captures) ? payments.captures : [];
  const firstCapture = captures[0] || {};
  const amount = firstCapture.amount || purchaseUnit.amount || {};
  return {
    captureId: clean(firstCapture.id || capture.id),
    status: clean(firstCapture.status || capture.status),
    orderStatus: clean(capture.status),
    currency: clean(amount.currency_code || CURRENCY),
    value: roundMoney(amount.value || 0),
    payerEmail: clean(capture.payer?.email_address || "").toLowerCase(),
  };
}

function validateCapturedAmount(captureInfo, expectedTotal) {
  if (captureInfo.currency !== CURRENCY || !moneyClose(captureInfo.value, expectedTotal)) {
    const error = new Error("El monto capturado por PayPal no coincide con el total de la orden.");
    error.statusCode = 409;
    throw error;
  }

  const completed = [captureInfo.status, captureInfo.orderStatus].some((status) => lower(status) === "completed");
  if (!completed) {
    const error = new Error("PayPal no confirmó la captura del pago.");
    error.statusCode = 409;
    throw error;
  }
}

function productOptionsText(product = {}) {
  const parts = [];
  if (Array.isArray(product.sizes) && product.sizes.length) parts.push(`Tallas: ${product.sizes.join(", ")}`);
  if (Array.isArray(product.colors) && product.colors.length) parts.push(`Colores: ${product.colors.join(", ")}`);
  return parts.join("\n");
}

function productsHtml(orderProducts = []) {
  return orderProducts
    .map(
      (item, index) => `
        <div style="padding:12px 0; border-bottom:1px solid #e5e7eb;">
          <p><b>Producto ${index + 1}</b></p>
          <p><b>ID:</b> ${escapeHtml(item.id)}</p>
          <p><b>Nombre:</b> ${escapeHtml(item.name)}</p>
          <p><b>Precio:</b> $${money(item.price)}</p>
          ${item.sizes?.length ? `<p><b>Tallas:</b> ${escapeHtml(item.sizes.join(", "))}</p>` : ""}
          ${item.colors?.length ? `<p><b>Colores:</b> ${escapeHtml(item.colors.join(", "))}</p>` : ""}
        </div>
      `
    )
    .join("");
}

function productsText(orderProducts = []) {
  return orderProducts
    .map(
      (item, index) =>
        `Producto ${index + 1}\nID: ${item.id}\nNombre: ${item.name}\nPrecio: $${money(item.price)}${
          item.sizes?.length ? `\nTallas: ${item.sizes.join(", ")}` : ""
        }${item.colors?.length ? `\nColores: ${item.colors.join(", ")}` : ""}`
    )
    .join("\n\n");
}

function buildSaleNotifications(order) {
  return order.products
    .filter((product) => clean(product.sellerNotificationEmail || product.saleNotificationEmail))
    .map((product) => ({
      to: clean(product.sellerNotificationEmail || product.saleNotificationEmail),
      message: `Tu producto ha sido vendido.\n\nProducto: ${product.name || ""}\nID: ${product.id || ""}\nPrecio: $${money(product.price)}${
        productOptionsText(product) ? `\n${productOptionsText(product)}` : ""
      }\n\nComunícate al 5633535701 o 5617549756 para la recolección de tu paquete.`,
      sellerName: product.ownerName || "",
      productName: product.name || "",
      productId: product.id || "",
    }));
}

async function sendOrderEmails(mailSettings, order) {
  assertMailConfig(mailSettings);
  const transporter = createTransporter(mailSettings);
  const orderProducts = order.products || [];
  const delivery = order.delivery || {};
  const productSubject = orderProducts.length > 1 ? `${orderProducts.length} productos` : orderProducts[0]?.name || "producto";
  const orderTotal = roundMoney(order.cart?.total || orderProducts.reduce((total, item) => total + Number(item.price || 0), 0));
  const itemCount = Number(order.cart?.itemCount || orderProducts.length);

  const html = `
    <div style="font-family: Arial, sans-serif; color:#111827;">
      <h2>Nueva solicitud de compra</h2>
      <p><b>Método de pago:</b> PayPal</p>
      ${order.paypalOrderId ? `<p><b>Orden PayPal:</b> ${escapeHtml(order.paypalOrderId)}</p>` : ""}
      ${order.paypalCaptureId ? `<p><b>Captura PayPal:</b> ${escapeHtml(order.paypalCaptureId)}</p>` : ""}

      <h3>Productos</h3>
      ${productsHtml(orderProducts)}
      <p><b>Total acumulado:</b> $${money(orderTotal)}</p>
      <p><b>Cantidad de productos:</b> ${itemCount}</p>

      <hr />

      <h3>Datos de entrega</h3>
      <p><b>Calle:</b> ${escapeHtml(delivery.street)}</p>
      <p><b>Estado:</b> ${escapeHtml(delivery.state)}</p>
      <p><b>Municipio:</b> ${escapeHtml(delivery.municipality)}</p>
      <p><b>Colonia:</b> ${escapeHtml(delivery.neighborhood)}</p>
      <p><b>Código Postal:</b> ${escapeHtml(delivery.zip)}</p>
      <p><b>Nombre completo:</b> ${escapeHtml(delivery.fullName)}</p>
      <p><b>Teléfono:</b> ${escapeHtml(delivery.phone)}</p>
      <p><b>Correo electrónico:</b> ${escapeHtml(delivery.email)}</p>
      <p><b>Referencias:</b> ${escapeHtml(delivery.references)}</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Drive MX" <${mailSettings.senderEmail}>`,
    to: mailSettings.receiverEmail,
    subject: `Nueva compra PayPal - ${productSubject}`,
    html,
    replyTo: clean(delivery.email),
  });

  const targetsByEmail = new Map();
  for (const target of buildSaleNotifications(order)) {
    if (!target.to || targetsByEmail.has(target.to.toLowerCase())) continue;
    targetsByEmail.set(target.to.toLowerCase(), target);
  }

  const saleProductsHtml = productsHtml(orderProducts);
  const saleProductsText = productsText(orderProducts);
  const saleNotificationErrors = [];
  let saleNotificationSent = false;
  let saleNotificationCount = 0;

  for (const target of targetsByEmail.values()) {
    if (!isValidEmail(target.to)) {
      saleNotificationErrors.push(`${target.to}: correo de notificación de venta no válido.`);
      continue;
    }

    const saleMessage = clean(target.message) || SALE_NOTIFICATION_MESSAGE;
    const saleHtml = `
      <div style="font-family: Arial, sans-serif; color:#111827;">
        <p>${escapeHtml(saleMessage).replace(/\n/g, "<br />")}</p>

        <h3>Productos de la compra</h3>
        ${saleProductsHtml}
        <p><b>Total acumulado:</b> $${money(orderTotal)}</p>

        <hr />

        <h3>Datos del comprador</h3>
        <p><b>Nombre completo:</b> ${escapeHtml(delivery.fullName)}</p>
        <p><b>Teléfono:</b> ${escapeHtml(delivery.phone)}</p>
        <p><b>Correo electrónico:</b> ${escapeHtml(delivery.email)}</p>
        <p><b>Dirección:</b> ${escapeHtml(
          [delivery.street, delivery.neighborhood, delivery.municipality, delivery.state, delivery.zip]
            .map(clean)
            .filter(Boolean)
            .join(", ")
        )}</p>
        <p><b>Referencias:</b> ${escapeHtml(delivery.references)}</p>
      </div>
    `;

    const saleText = `${saleMessage}\n\nProductos de la compra:\n${saleProductsText}\n\nTotal acumulado: $${money(
      orderTotal
    )}\n\nComprador:\nNombre: ${clean(delivery.fullName)}\nTeléfono: ${clean(delivery.phone)}\nCorreo: ${clean(
      delivery.email
    )}\nReferencias: ${clean(delivery.references)}`;

    try {
      await transporter.sendMail({
        from: `"Drive MX" <${mailSettings.senderEmail}>`,
        to: target.to,
        subject: "Tu producto ha sido vendido - Drive MX",
        text: saleText,
        html: saleHtml,
      });
      saleNotificationSent = true;
      saleNotificationCount += 1;
    } catch (saleError) {
      console.error("Error enviando notificación de venta:", saleError);
      saleNotificationErrors.push(`${target.to}: ${saleError.message || "No se pudo enviar la notificación de venta."}`);
    }
  }

  return {
    saleNotificationSent,
    saleNotificationCount,
    saleNotificationError: saleNotificationErrors.join(" | "),
  };
}

function buildOrderDocId(paypalOrderId) {
  return safeDocId(`paypal_${paypalOrderId}`);
}

function buildSaleId(orderDocId, index, total) {
  return total > 1 ? safeDocId(`${orderDocId}_${index + 1}`) : safeDocId(orderDocId);
}

function buildSaleRecord({ orderDocId, product, order, captureInfo, index }) {
  const saleId = buildSaleId(orderDocId, index, order.products.length);
  return {
    saleId,
    orderSaleId: orderDocId,
    cartItemCount: order.products.length,
    orderTotal: roundMoney(order.cart.total),
    paymentMethod: "PayPal",
    transferId: "",
    paypalOrderId: order.paypalOrderId,
    paypalCaptureId: order.paypalCaptureId,
    paypalCaptureStatus: captureInfo.status || captureInfo.orderStatus || "COMPLETED",
    paypalPayerEmail: captureInfo.payerEmail || "",
    productId: product.id || "",
    productName: product.name || "",
    productCost: roundMoney(product.price || 0),
    productSizes: normalizeList(product.sizes, product.tallas),
    productTallas: normalizeList(product.sizes, product.tallas),
    productColors: normalizeList(product.colors, product.colores),
    productColores: normalizeList(product.colors, product.colores),
    sellerId: product.ownerId || "",
    sellerName: product.ownerName || "Admin Central",
    sellerEmail: product.ownerEmail || ADMIN_EMAIL,
    sellerPhone: product.ownerPhone || "-",
    sellerNotificationEmail: product.sellerNotificationEmail || product.saleNotificationEmail || "",
    buyerName: order.delivery.fullName || "",
    buyerEmail: order.delivery.email || "",
    buyerPhone: order.delivery.phone || "",
    soldAt: order.paidAt,
    createdAt: order.paidAt,
    updatedAt: order.updatedAt,
  };
}

function updateProductStock(tx, root, productSnap, product) {
  const productRef = root.collection(PUBLIC_PRODUCTS_COLLECTION).doc(product.id);
  const current = productSnap.data() || {};
  const stockBefore = Number(current.stock ?? product.stock ?? 0);
  if (!Number.isFinite(stockBefore) || stockBefore <= 0 || current.active === false) {
    throw new Error(`El producto ${product.name} ya no tiene inventario disponible.`);
  }
  const stockAfter = Math.max(0, stockBefore - 1);
  const active = stockAfter > 0 && current.active !== false;
  const nextStockData = { stock: stockAfter, active, updatedAt: Date.now(), lastSoldAt: Date.now() };
  tx.set(productRef, nextStockData, { merge: true });

  if (product.isUserProduct && product.ownerId) {
    tx.set(root.collection(USER_PRODUCTS_COLLECTION).doc(safeDocId(product.ownerId)).collection("items").doc(product.id), nextStockData, { merge: true });
  } else {
    tx.set(root.collection(ADMIN_PRODUCTS_COLLECTION).doc(product.id), nextStockData, { merge: true });
  }
}

function buildCommissionRecords({ root, wallet, sale, percent, actor }) {
  const walletId = safeDocId(wallet.id || wallet.uid || wallet.userId || sale.sellerId || "");
  const commissionAmount = calculateCommission(sale.productCost, percent);

  if (!walletId || commissionAmount <= 0) {
    return {
      applies: Boolean(walletId),
      commissionAmount,
      percent,
      balanceBefore: wallet ? roundMoney(wallet.balance || 0) : null,
      balanceAfter: wallet ? roundMoney(wallet.balance || 0) : null,
      writes: [],
      nextWallet: wallet || null,
      status: commissionAmount > 0 ? "Pendiente de descuento" : "Sin comisión",
    };
  }

  if (!wallet || !isWalletActivated(wallet) || roundMoney(wallet.balance || 0) < commissionAmount) {
    return {
      applies: true,
      commissionAmount,
      percent,
      balanceBefore: wallet ? roundMoney(wallet.balance || 0) : null,
      balanceAfter: wallet ? roundMoney(wallet.balance || 0) : null,
      writes: [],
      nextWallet: wallet || null,
      status: "Pendiente de descuento",
    };
  }

  const createdAt = Date.now();
  const balanceBefore = roundMoney(wallet.balance || 0);
  const balanceAfter = roundMoney(balanceBefore - commissionAmount);
  const movementId = safeDocId(`mov_commission_${sale.saleId}_${createdAt}`);
  const commissionId = safeDocId(`commission_${walletId}_${sale.saleId}_${createdAt}`);
  const nextWallet = {
    ...wallet,
    balance: balanceAfter,
    totalCommissions: roundMoney(Number(wallet.totalCommissions || 0) + commissionAmount),
    lastCommissionAt: createdAt,
    updatedAt: createdAt,
    updatedBy: actor,
    status: balanceAfter > 0 ? "Activa" : "Sin saldo",
  };
  const movement = {
    id: movementId,
    movementId,
    walletId,
    userId: walletId,
    userName: wallet.userName || sale.sellerName || "",
    userEmail: wallet.userEmail || sale.sellerEmail || "",
    type: "commission",
    direction: "debit",
    concept: `Comisión por venta: ${sale.productName || "producto vendido"}`,
    amount: -commissionAmount,
    absoluteAmount: commissionAmount,
    balanceBefore,
    balanceAfter,
    currency: CURRENCY,
    commissionPercent: percent,
    saleId: sale.saleId,
    productId: sale.productId || "",
    productName: sale.productName || "",
    createdAt,
    createdBy: actor,
  };
  const commission = { ...movement, id: commissionId, commissionId, status: "Descontada" };

  return {
    applies: true,
    commissionAmount,
    percent,
    balanceBefore,
    balanceAfter,
    writes: [
      { ref: root.collection(WALLETS_COLLECTION).doc(walletId), data: nextWallet, options: { merge: true } },
      { ref: root.collection(WALLETS_COLLECTION).doc(walletId).collection(MOVEMENTS_COLLECTION).doc(movementId), data: movement },
      { ref: root.collection(WALLET_COMMISSIONS_COLLECTION).doc(commissionId), data: commission },
    ],
    nextWallet,
    status: "Descontada",
  };
}

async function persistCapturedOrder(db, root, order, captureInfo) {
  const orderDocId = buildOrderDocId(order.paypalOrderId);
  const orderRef = root.collection(ORDERS_COLLECTION).doc(orderDocId);
  let persisted = { alreadyRecorded: false, sales: [] };

  await db.runTransaction(async (tx) => {
    const existingOrderSnap = await tx.get(orderRef);
    if (existingOrderSnap.exists && existingOrderSnap.data()?.status === "Pagado") {
      persisted = {
        alreadyRecorded: true,
        sales: existingOrderSnap.data()?.sales || [],
        orderId: orderDocId,
      };
      return;
    }

    const productRefs = order.products.map((product) => root.collection(PUBLIC_PRODUCTS_COLLECTION).doc(product.id));
    const productSnaps = [];
    for (const ref of productRefs) productSnaps.push(await tx.get(ref));

    const walletSettingsSnap = await tx.get(root.collection(WALLET_SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID));
    const walletSettings = walletSettingsSnap.exists ? walletSettingsSnap.data() || {} : {};
    const commissionPercent = normalizePercent(walletSettings.globalCommissionPercent ?? walletSettings.commissionPercent ?? 0);

    const walletRefsBySeller = new Map();
    for (const product of order.products) {
      if (!product.isUserProduct || !product.ownerId) continue;
      const walletId = safeDocId(product.ownerId);
      if (!walletRefsBySeller.has(walletId)) walletRefsBySeller.set(walletId, root.collection(WALLETS_COLLECTION).doc(walletId));
    }

    const walletSnaps = new Map();
    for (const [walletId, walletRef] of walletRefsBySeller.entries()) {
      const snap = await tx.get(walletRef);
      walletSnaps.set(walletId, snap.exists ? { id: snap.id, ...snap.data() } : null);
    }

    const sales = [];
    const walletWrites = [];
    order.products.forEach((product, index) => updateProductStock(tx, root, productSnaps[index], product));

    order.products.forEach((product, index) => {
      const sale = buildSaleRecord({ orderDocId, product, order, captureInfo, index });
      const walletId = safeDocId(product.ownerId || "");
      const wallet = walletId ? walletSnaps.get(walletId) : null;
      const commission = product.isUserProduct
        ? buildCommissionRecords({ root, wallet, sale, percent: commissionPercent, actor: "PayPal" })
        : {
            commissionAmount: 0,
            percent: commissionPercent,
            balanceBefore: null,
            balanceAfter: null,
            writes: [],
            status: "Sin comisión",
          };

      const saleWithWallet = {
        ...sale,
        walletCommissionPercent: commission.percent ?? commissionPercent,
        walletCommissionAmount: Number(commission.commissionAmount || 0),
        walletCommissionStatus: commission.status,
        walletBalanceBeforeCommission: commission.balanceBefore,
        walletBalanceAfterCommission: commission.balanceAfter,
      };

      tx.set(root.collection(COMPLETED_SALES_COLLECTION).doc(sale.saleId), saleWithWallet);
      if (sale.sellerId) {
        tx.set(root.collection(USER_SALES_COLLECTION).doc(safeDocId(sale.sellerId)).collection("items").doc(sale.saleId), {
          id: sale.saleId,
          ...saleWithWallet,
        });
      }
      commission.writes.forEach((write) => walletWrites.push(write));
      sales.push({ id: sale.saleId, ...saleWithWallet });
    });

    walletWrites.forEach((write) => {
      if (write.options) tx.set(write.ref, write.data, write.options);
      else tx.set(write.ref, write.data);
    });

    const orderDoc = {
      id: orderDocId,
      orderId: orderDocId,
      status: "Pagado",
      paymentMethod: "PayPal",
      paypalOrderId: order.paypalOrderId,
      paypalCaptureId: order.paypalCaptureId,
      paypalCaptureStatus: captureInfo.status || captureInfo.orderStatus || "COMPLETED",
      paypalPayerEmail: captureInfo.payerEmail || "",
      products: order.products,
      product: order.products[0] || {},
      cart: order.cart,
      delivery: order.delivery,
      total: roundMoney(order.cart.total),
      sales,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      updatedAt: order.updatedAt,
    };

    tx.set(orderRef, orderDoc);
    persisted = { alreadyRecorded: false, sales, orderId: orderDocId, order: orderDoc };
  });

  return persisted;
}

async function createPayPalOrder(root, payload) {
  const paypalSettings = await readPaymentSettings(root);
  const mailSettings = await readMailSettings(root);
  assertPaypalConfig(paypalSettings);
  assertMailConfig(mailSettings);

  const order = await normalizeOrderPayload(root, payload);
  await validateWalletsBeforePayment(root, order.products);

  if (process.env.VERIFY_EMAIL_ON_PAYPAL_CREATE !== "false") {
    await createTransporter(mailSettings).verify();
  }

  const paypalOrder = await paypalRequest(paypalSettings, "/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": safeDocId(`drive_mx_create_${Date.now()}_${order.cart.total}`) },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: safeDocId(`drive_mx_${Date.now()}`),
          description: order.products.length > 1 ? `${order.products.length} productos Drive MX` : order.products[0].name,
          custom_id: safeDocId(order.products.map((product) => product.id).join("_")),
          amount: {
            currency_code: CURRENCY,
            value: money(order.cart.total),
          },
        },
      ],
    },
  });

  return {
    orderID: paypalOrder.id,
    paypalOrderId: paypalOrder.id,
    amount: money(order.cart.total),
    currency: CURRENCY,
  };
}

async function getExistingRecordedOrder(root, paypalOrderId) {
  const orderDocId = buildOrderDocId(paypalOrderId);
  const snap = await root.collection(ORDERS_COLLECTION).doc(orderDocId).get();
  if (!snap.exists || snap.data()?.status !== "Pagado") return null;
  return { orderId: orderDocId, ...snap.data(), alreadyRecorded: true };
}

async function capturePayPalOrder(db, root, paypalOrderId, payload) {
  const orderId = clean(paypalOrderId);
  if (!orderId) {
    const error = new Error("Falta el ID de la orden PayPal.");
    error.statusCode = 400;
    throw error;
  }

  const existing = await getExistingRecordedOrder(root, orderId);
  if (existing) {
    return {
      orderID: orderId,
      orderId: existing.orderId,
      captureID: existing.paypalCaptureId || "",
      alreadyRecorded: true,
      sales: existing.sales || [],
      emailWarning: "",
    };
  }

  const paypalSettings = await readPaymentSettings(root);
  const mailSettings = await readMailSettings(root);
  assertPaypalConfig(paypalSettings);
  assertMailConfig(mailSettings);

  const normalizedOrder = await normalizeOrderPayload(root, payload);
  await validateWalletsBeforePayment(root, normalizedOrder.products);

  const paypalOrder = await paypalRequest(paypalSettings, `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  const paypalAmount = paypalOrder.purchase_units?.[0]?.amount;
  if (paypalAmount?.currency_code !== CURRENCY || !moneyClose(paypalAmount?.value, normalizedOrder.cart.total)) {
    const error = new Error("El monto aprobado por PayPal no coincide con el total actual de la compra.");
    error.statusCode = 409;
    throw error;
  }

  let capture;
  try {
    capture = await paypalRequest(paypalSettings, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": safeDocId(`drive_mx_capture_${orderId}`) },
      body: {},
    });
  } catch (error) {
    if (lower(error.paypal?.name) !== "unprocessable_entity" && !String(error.message || "").toLowerCase().includes("already")) {
      throw error;
    }
    capture = await paypalRequest(paypalSettings, `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  const captureInfo = getCaptureInfo(capture);
  validateCapturedAmount(captureInfo, normalizedOrder.cart.total);

  const now = Date.now();
  const order = {
    ...normalizedOrder,
    paypalOrderId: orderId,
    paypalCaptureId: captureInfo.captureId,
    createdAt: now,
    paidAt: now,
    updatedAt: now,
  };

  const persisted = await persistCapturedOrder(db, root, order, captureInfo);
  let emailResult = {};
  let emailWarning = "";
  if (!persisted.alreadyRecorded) {
    try {
      emailResult = await sendOrderEmails(mailSettings, order);
    } catch (error) {
      console.error("Error enviando correo PayPal:", error);
      emailWarning = error.message || "No se pudo enviar el correo.";
    }
  }

  return {
    orderID: orderId,
    orderId: persisted.orderId,
    captureID: captureInfo.captureId,
    paypalStatus: captureInfo.status || captureInfo.orderStatus,
    alreadyRecorded: persisted.alreadyRecorded,
    sales: persisted.sales,
    emailWarning,
    saleNotificationSent: emailResult.saleNotificationSent || false,
    saleNotificationCount: emailResult.saleNotificationCount || 0,
    saleNotificationError: emailResult.saleNotificationError || "",
  };
}

async function getPublicConfig(root) {
  const paymentSettings = await readPaymentSettings(root);
  const mailSettings = await readMailSettings(root);
  return {
    bankAccount: paymentSettings.bankAccount,
    paypalClientId: paymentSettings.clientId,
    paypalConfigured: Boolean(paymentSettings.clientId && paymentSettings.clientSecret),
    emailConfigured: Boolean(mailSettings.senderEmail && mailSettings.appPassword && mailSettings.receiverEmail),
    paypalEnvironment: paymentSettings.mode,
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
    ensureAdmin();
    const db = admin.firestore();
    const root = getRoot(db);

    if (req.method === "GET" || req.body?.action === "config" || req.query?.action === "config") {
      const config = await getPublicConfig(root);
      return res.status(200).json({ success: true, ...config });
    }

    const { action, payload = {}, orderID, paypalOrderId } = req.body || {};
    if (action === "create") {
      const result = await createPayPalOrder(root, payload);
      return res.status(200).json({ success: true, ...result });
    }

    if (action === "capture") {
      const result = await capturePayPalOrder(db, root, orderID || paypalOrderId, payload);
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
