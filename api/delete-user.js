const admin = require("firebase-admin");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@drivemx.com").trim().toLowerCase();
const APP_ID = process.env.DRIVE_MX_APP_ID || process.env.FIREBASE_PROJECT_ID || "drivemx-paqueteria";
const STAFF_USERS_COLLECTION = "operators";
const PUBLIC_PRODUCTS_COLLECTION = "products";
const USER_PRODUCTS_COLLECTION = "user_products";
const USER_SALES_COLLECTION = "user_sales";
const COMPLETED_SALES_COLLECTION = "completed_sales";
const SUPPORT_CHATS_COLLECTION = "support_chats";

function clean(value) {
  return String(value ?? "").trim();
}

function safeDocId(value) {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, "_");
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
        throw new Error("La variable FIREBASE_SERVICE_ACCOUNT_KEY no contiene JSON válido ni JSON en base64.");
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
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "drivemx-paqueteria",
    });
  }

  return admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "drivemx-paqueteria" });
}

function dataRoot(db) {
  return db.collection("artifacts").doc(APP_ID).collection("public").doc("data");
}

function ignoreNotFound(error) {
  if (!error) return true;
  const code = error.code || "";
  return code === 5 || code === "not-found" || code === "auth/user-not-found";
}

async function deleteRef(ref, deletedPaths) {
  if (!ref || deletedPaths.has(ref.path)) return false;
  deletedPaths.add(ref.path);
  try {
    await ref.delete();
    return true;
  } catch (error) {
    if (ignoreNotFound(error)) return false;
    throw error;
  }
}

async function deleteCollection(collectionRef, deletedPaths, batchSize = 100) {
  let total = 0;
  while (true) {
    const snap = await collectionRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = collectionRef.firestore.batch();
    snap.docs.forEach((doc) => {
      if (deletedPaths.has(doc.ref.path)) return;
      deletedPaths.add(doc.ref.path);
      batch.delete(doc.ref);
      total += 1;
    });
    await batch.commit();
    if (snap.size < batchSize) break;
  }
  return total;
}

async function deleteQueryMatches(query, deletedPaths) {
  const snap = await query.get();
  let total = 0;
  for (const doc of snap.docs) {
    if (deletedPaths.has(doc.ref.path)) continue;
    deletedPaths.add(doc.ref.path);
    await doc.ref.delete();
    total += 1;
  }
  return total;
}

async function deleteWhereEquals(collectionRef, field, value, deletedPaths) {
  const normalized = clean(value);
  if (!normalized) return 0;
  return deleteQueryMatches(collectionRef.where(field, "==", normalized), deletedPaths);
}

async function requireAdmin(req) {
  const authHeader = clean(req.headers.authorization || req.headers.Authorization || "");
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Falta token de administrador.");
    error.statusCode = 401;
    throw error;
  }

  const app = getAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token, true);
  const email = clean(decoded.email).toLowerCase();
  if (email !== ADMIN_EMAIL) {
    const error = new Error("No autorizado para eliminar usuarios.");
    error.statusCode = 403;
    throw error;
  }
  return decoded;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido." });
  }

  try {
    await requireAdmin(req);

    const uid = clean(req.body?.uid || req.body?.id);
    const email = clean(req.body?.email).toLowerCase();
    if (!uid) {
      return res.status(400).json({ success: false, error: "Falta el UID del usuario." });
    }
    if (email === ADMIN_EMAIL) {
      return res.status(400).json({ success: false, error: "No se puede eliminar al administrador central." });
    }

    const app = getAdminApp();
    const db = admin.firestore(app);
    const root = dataRoot(db);
    const deletedPaths = new Set();
    const uidDocId = safeDocId(uid);

    let deletedFirestoreDocs = 0;

    deletedFirestoreDocs += await deleteCollection(root.collection(USER_PRODUCTS_COLLECTION).doc(uidDocId).collection("items"), deletedPaths);
    deletedFirestoreDocs += (await deleteRef(root.collection(USER_PRODUCTS_COLLECTION).doc(uidDocId), deletedPaths)) ? 1 : 0;

    deletedFirestoreDocs += await deleteCollection(root.collection(USER_SALES_COLLECTION).doc(uidDocId).collection("items"), deletedPaths);
    deletedFirestoreDocs += (await deleteRef(root.collection(USER_SALES_COLLECTION).doc(uidDocId), deletedPaths)) ? 1 : 0;

    const productCollection = root.collection(PUBLIC_PRODUCTS_COLLECTION);
    for (const field of ["ownerId", "sellerId", "userId", "createdByUid"]) {
      deletedFirestoreDocs += await deleteWhereEquals(productCollection, field, uid, deletedPaths);
    }
    if (email) {
      for (const field of ["ownerEmail", "sellerEmail", "createdBy", "createdByEmail"]) {
        deletedFirestoreDocs += await deleteWhereEquals(productCollection, field, email, deletedPaths);
      }
    }

    const completedSalesCollection = root.collection(COMPLETED_SALES_COLLECTION);
    for (const field of ["sellerId", "ownerId", "userId"]) {
      deletedFirestoreDocs += await deleteWhereEquals(completedSalesCollection, field, uid, deletedPaths);
    }
    if (email) {
      for (const field of ["sellerEmail", "ownerEmail", "userEmail"]) {
        deletedFirestoreDocs += await deleteWhereEquals(completedSalesCollection, field, email, deletedPaths);
      }
    }

    const supportCollection = root.collection(SUPPORT_CHATS_COLLECTION);
    for (const field of ["userId", "uid", "ownerId"]) {
      deletedFirestoreDocs += await deleteWhereEquals(supportCollection, field, uid, deletedPaths);
    }
    if (email) {
      for (const field of ["userEmail", "email"]) {
        deletedFirestoreDocs += await deleteWhereEquals(supportCollection, field, email, deletedPaths);
      }
    }

    deletedFirestoreDocs += (await deleteRef(root.collection(STAFF_USERS_COLLECTION).doc(uid), deletedPaths)) ? 1 : 0;
    if (uidDocId !== uid) {
      deletedFirestoreDocs += (await deleteRef(root.collection(STAFF_USERS_COLLECTION).doc(uidDocId), deletedPaths)) ? 1 : 0;
    }

    let authenticationDeleted = false;
    let sessionsRevoked = false;
    try {
      await admin.auth(app).revokeRefreshTokens(uid);
      sessionsRevoked = true;
    } catch (error) {
      if (!ignoreNotFound(error)) throw error;
    }
    try {
      await admin.auth(app).deleteUser(uid);
      authenticationDeleted = true;
    } catch (error) {
      if (!ignoreNotFound(error)) throw error;
    }

    return res.status(200).json({
      success: true,
      uid,
      authenticationDeleted,
      sessionsRevoked,
      deletedFirestoreDocs,
    });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "No se pudo eliminar el usuario.",
    });
  }
};
