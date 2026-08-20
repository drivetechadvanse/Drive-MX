const admin = require("firebase-admin");

const APP_ID = "saxrecords-appcreat";
const TRANSFERS_COLLECTION = "bank_transfers";
const MAX_PRODUCTS = 500;
const MAX_REQUEST_BYTES = 900000;

function clean(value) {
  return String(value ?? "").trim();
}

function publicError(message, statusCode = 400, code = "invalid-request") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(String(req.body || "{}"));
  } catch (error) {
    throw publicError("La información enviada no es válida.", 400, "invalid-json");
  }
}

function parseServiceAccountFromEnv() {
  const rawJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (jsonError) {
      try {
        parsed = JSON.parse(Buffer.from(rawJson, "base64").toString("utf8"));
      } catch (base64Error) {
        throw publicError(
          "Firebase Admin no tiene credenciales válidas en Vercel.",
          500,
          "firebase-admin-invalid-credentials"
        );
      }
    }
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || APP_ID,
    });
  }

  return admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || APP_ID,
  });
}

function dataRoot(db) {
  return db.collection("artifacts").doc(APP_ID).collection("public").doc("data");
}

function sanitizeValue(value, depth = 0) {
  if (depth > 14) throw publicError("El pedido contiene demasiados niveles de información.", 400, "payload-too-deep");
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return value.slice(0, 20000);
  if (Array.isArray(value)) {
    if (value.length > MAX_PRODUCTS) {
      throw publicError(`El pedido supera el máximo permitido de ${MAX_PRODUCTS} elementos.`, 400, "too-many-items");
    }
    return value
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      const safeKey = clean(key).slice(0, 200);
      if (!safeKey) continue;
      const safeItem = sanitizeValue(item, depth + 1);
      if (safeItem !== undefined) result[safeKey] = safeItem;
    }
    return result;
  }
  return clean(value).slice(0, 20000);
}

function finiteNumber(value, field, { min = 0, max = 20000000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw publicError(`El campo ${field} no es válido.`, 400, "invalid-number");
  }
  return number;
}

function requiredText(value, field, maxLength) {
  const text = clean(value);
  if (!text) throw publicError(`Falta el campo ${field}.`, 400, "missing-field");
  if (text.length > maxLength) {
    throw publicError(`El campo ${field} es demasiado largo.`, 400, "field-too-long");
  }
  return text;
}

function validateTransfer(transferId, transfer) {
  if (!/^TR-\d{10,}-[A-Z0-9]{6}$/.test(transferId)) {
    throw publicError("El identificador de la transferencia no es válido.", 400, "invalid-transfer-id");
  }
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) {
    throw publicError("No se recibió la información de la transferencia.", 400, "transfer-missing");
  }
  if (clean(transfer.transferId) !== transferId) {
    throw publicError("El identificador del documento no coincide con la transferencia.", 400, "transfer-id-mismatch");
  }
  if (clean(transfer.type) !== "purchase") {
    throw publicError("El tipo de transferencia no es válido.", 400, "invalid-transfer-type");
  }
  if (clean(transfer.paymentMethod) !== "Transferencia bancaria") {
    throw publicError("El método de pago no es válido.", 400, "invalid-payment-method");
  }
  if (clean(transfer.status) !== "Pendiente") {
    throw publicError("El estado inicial de la transferencia no es válido.", 400, "invalid-transfer-status");
  }

  requiredText(transfer.bankAccount, "cuenta bancaria", 160);
  requiredText(transfer.holderName, "nombre del titular", 180);
  finiteNumber(transfer.createdAt, "createdAt", { min: 1, max: 9999999999999 });
  finiteNumber(transfer.updatedAt, "updatedAt", { min: 1, max: 9999999999999 });

  const order = transfer.order;
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    throw publicError("El pedido no contiene una orden válida.", 400, "order-missing");
  }

  const products = Array.isArray(order.products) ? order.products : [];
  if (products.length < 1 || products.length > MAX_PRODUCTS) {
    throw publicError("La cantidad de productos del pedido no es válida.", 400, "invalid-products-count");
  }

  products.forEach((product, index) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      throw publicError(`El producto ${index + 1} no es válido.`, 400, "invalid-product");
    }
    requiredText(product.id, `ID del producto ${index + 1}`, 180);
    requiredText(product.name, `nombre del producto ${index + 1}`, 180);
    finiteNumber(product.price ?? product.unitPrice, `precio del producto ${index + 1}`);
    finiteNumber(product.quantity ?? product.productQuantity, `cantidad del producto ${index + 1}`, {
      min: 1,
      max: 1000000,
    });
  });

  const cart = order.cart;
  if (!cart || typeof cart !== "object" || Array.isArray(cart)) {
    throw publicError("El carrito del pedido no es válido.", 400, "cart-missing");
  }
  const itemCount = finiteNumber(cart.itemCount, "cantidad de productos", { min: 1, max: MAX_PRODUCTS });
  if (Math.floor(itemCount) !== products.length) {
    throw publicError("La cantidad del carrito no coincide con los productos enviados.", 400, "cart-count-mismatch");
  }
  finiteNumber(cart.total, "total del pedido");

  const delivery = order.delivery;
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    throw publicError("Faltan los datos de entrega.", 400, "delivery-missing");
  }
  requiredText(delivery.street, "calle", 240);
  requiredText(delivery.state, "estado", 120);
  requiredText(delivery.municipality, "municipio", 140);
  requiredText(delivery.neighborhood, "colonia", 180);
  requiredText(delivery.zip, "código postal", 25);
  requiredText(delivery.fullName, "nombre completo", 180);
  requiredText(delivery.phone, "teléfono", 60);
  const email = requiredText(delivery.email, "correo electrónico", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw publicError("El correo electrónico no es válido.", 400, "invalid-email");
  }
  requiredText(delivery.references, "referencias del domicilio", 1200);
}

function normalizeCredentialError(error) {
  const code = clean(error?.code).toLowerCase();
  const message = clean(error?.message).toLowerCase();
  const credentialFailure =
    code.includes("credential") ||
    code.includes("app/invalid") ||
    message.includes("credential") ||
    message.includes("service account") ||
    message.includes("default credentials") ||
    message.includes("could not load the default credentials");

  if (credentialFailure) {
    return publicError(
      "Firebase Admin no está configurado correctamente en Vercel.",
      500,
      "firebase-admin-not-configured"
    );
  }
  return error;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, code: "method-not-allowed", error: "Método no permitido." });
  }

  try {
    const contentLength = Number(req.headers?.["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw publicError("El pedido supera el tamaño permitido.", 413, "payload-too-large");
    }

    const body = parseBody(req);
    const transferId = clean(body.transferId || body.transfer?.transferId);
    const transfer = sanitizeValue(body.transfer || body.transferData || {});
    const serializedLength = Buffer.byteLength(JSON.stringify(transfer), "utf8");
    if (serializedLength > MAX_REQUEST_BYTES) {
      throw publicError("El pedido supera el tamaño permitido.", 413, "payload-too-large");
    }

    validateTransfer(transferId, transfer);

    let app;
    try {
      app = getAdminApp();
    } catch (error) {
      throw normalizeCredentialError(error);
    }

    const db = admin.firestore(app);
    const transferRef = dataRoot(db).collection(TRANSFERS_COLLECTION).doc(transferId);
    let alreadyExists = false;

    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(transferRef);
        if (snapshot.exists) {
          const existing = snapshot.data() || {};
          if (clean(existing.transferId) === transferId && clean(existing.type) === "purchase") {
            alreadyExists = true;
            return;
          }
          throw publicError("Ya existe otro registro con ese identificador.", 409, "transfer-id-conflict");
        }
        transaction.set(transferRef, transfer);
      });
    } catch (error) {
      throw normalizeCredentialError(error);
    }

    return res.status(alreadyExists ? 200 : 201).json({
      success: true,
      transferId,
      alreadyExists,
    });
  } catch (rawError) {
    const error = normalizeCredentialError(rawError);
    const statusCode = Number(error?.statusCode || 500);
    const code = clean(error?.code) || "register-pending-transfer-failed";
    console.error("[register-pending-transfer] No se pudo registrar la transferencia.", {
      code,
      statusCode,
      message: error?.message || String(error),
    }, error);
    return res.status(statusCode).json({
      success: false,
      code,
      error: statusCode >= 500
        ? "No se pudo registrar la transferencia en el servidor."
        : (error?.message || "La solicitud no es válida."),
    });
  }
};
