const admin = require("firebase-admin");

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@drivemx.com").trim().toLowerCase();
const APP_ID = "saxrecords-appcreat";
const STAFF_USERS_COLLECTION = "operators";
const WALLET_COLLECTION = "wallets";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(String(req.body || "{}"));
  } catch (error) {
    const invalidBodyError = new Error("La información enviada no es válida.");
    invalidBodyError.statusCode = 400;
    invalidBodyError.code = "invalid-json";
    throw invalidBodyError;
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
        const invalidCredentialsError = new Error(
          "La variable FIREBASE_SERVICE_ACCOUNT_KEY no contiene JSON válido ni JSON en base64."
        );
        invalidCredentialsError.code = "firebase-admin-invalid-credentials";
        throw invalidCredentialsError;
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
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "saxrecords-appcreat",
    });
  }

  return admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "saxrecords-appcreat" });
}

function dataRoot(db) {
  return db.collection("artifacts").doc(APP_ID).collection("public").doc("data");
}

function getBearerToken(req) {
  const authHeader = clean(req?.headers?.authorization || req?.headers?.Authorization || "");
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

function publicError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validateRegistrationFields({ email, password, name, phone, adminCreating }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw publicError("El correo electrónico no es válido.", 400, "invalid-email");
  }
  if (email.length > 254) {
    throw publicError("El correo electrónico es demasiado largo.", 400, "email-too-long");
  }
  if (adminCreating && (!password || password.length < 6)) {
    throw publicError("La contraseña debe tener mínimo 6 caracteres.", 400, "weak-password");
  }
  if (password && password.length > 128) {
    throw publicError("La contraseña es demasiado larga.", 400, "password-too-long");
  }
  if (name.length > 160) {
    throw publicError("El nombre es demasiado largo.", 400, "name-too-long");
  }
  if (phone.length > 60) {
    throw publicError("El teléfono es demasiado largo.", 400, "phone-too-long");
  }
}

async function verifyCaller(req, app) {
  const token = getBearerToken(req);
  if (!token) throw publicError("Falta el token de la sesión.", 401, "missing-auth-token");

  try {
    return await admin.auth(app).verifyIdToken(token, true);
  } catch (error) {
    console.error("Validar token para crear o reparar usuario:", error);
    const errorCode = clean(error?.code).toLowerCase();
    const errorMessage = clean(error?.message).toLowerCase();
    const credentialFailure =
      errorCode.includes("credential") ||
      errorCode.includes("app/invalid") ||
      errorMessage.includes("credential") ||
      errorMessage.includes("service account") ||
      errorMessage.includes("default credentials");

    if (credentialFailure) {
      throw publicError(
        "Firebase Admin no está configurado correctamente en Vercel.",
        500,
        "firebase-admin-not-configured"
      );
    }

    throw publicError("La sesión ya no es válida. Inicia sesión nuevamente.", 401, "invalid-auth-token");
  }
}

function createdAtValue(existing, now) {
  return existing?.createdAt ?? now;
}

function buildProfile({ uid, email, name, phone, existing = {}, now, actorEmail }) {
  const blocked = existing.blocked === true || existing.isBlocked === true;
  const active = existing.active === false ? false : !blocked;
  const existingStatus = clean(existing.accountStatus);

  return {
    ...existing,
    id: uid,
    uid,
    email,
    emailNormalized: email,
    name: name || clean(existing.name) || email.split("@")[0] || "Usuario",
    phone: phone || clean(existing.phone),
    saleNotificationEmail: normalizeEmail(existing.saleNotificationEmail || email),
    role: "usuario",
    active,
    blocked,
    accountStatus: existingStatus || (blocked ? "Bloqueado" : "Activo"),
    assignmentsAuthorized: existing.assignmentsAuthorized === true,
    createdAt: createdAtValue(existing, now),
    updatedAt: now,
    updatedBy: actorEmail || email,
  };
}

function buildInitialWallet({ uid, profile, now, actorEmail }) {
  return {
    id: uid,
    uid,
    userId: uid,
    userName: profile.name || profile.email || "Usuario",
    userEmail: profile.email || "",
    userPhone: profile.phone || "",
    currency: "MXN",
    balance: 0,
    activated: false,
    firstRechargeCompleted: false,
    firstRechargeAt: null,
    rechargeCount: 0,
    totalRecharged: 0,
    totalCommissions: 0,
    lastRechargeAt: null,
    lastCommissionAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: actorEmail || profile.email || "",
    updatedBy: actorEmail || profile.email || "",
    status: "Pendiente de activación",
  };
}

async function ensureWallet(db, root, uid, profile, actorEmail) {
  const walletRef = root.collection(WALLET_COLLECTION).doc(uid);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(walletRef);
    if (!snapshot.exists) {
      transaction.set(walletRef, buildInitialWallet({ uid, profile, now, actorEmail }));
      return;
    }

    transaction.set(
      walletRef,
      {
        id: uid,
        uid,
        userId: uid,
        userName: profile.name || profile.email || "Usuario",
        userEmail: profile.email || "",
        userPhone: profile.phone || "",
        updatedAt: now,
        updatedBy: actorEmail || profile.email || "",
      },
      { merge: true }
    );
  });
}

async function getAuthUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, code: "method-not-allowed", error: "Método no permitido." });
  }

  try {
    const app = getAdminApp();
    const decoded = await verifyCaller(req, app);
    const body = parseBody(req);

    const callerEmail = normalizeEmail(decoded.email || "");
    const requestedEmail = normalizeEmail(body.email || callerEmail);
    const password = String(body.password || "");
    const name = clean(body.name);
    const phone = clean(body.phone);
    const callerIsAdmin = callerEmail === ADMIN_EMAIL;
    const adminCreatingAnotherUser = callerIsAdmin && requestedEmail && requestedEmail !== callerEmail;

    validateRegistrationFields({
      email: requestedEmail,
      password,
      name,
      phone,
      adminCreating: adminCreatingAnotherUser,
    });

    if (!callerIsAdmin && requestedEmail !== callerEmail) {
      throw publicError("No puedes crear o reparar el perfil de otro usuario.", 403, "profile-owner-mismatch");
    }
    if (requestedEmail === ADMIN_EMAIL && adminCreatingAnotherUser) {
      throw publicError("No se puede reemplazar la cuenta del administrador central.", 400, "admin-account-protected");
    }

    const auth = admin.auth(app);
    let authUser = null;
    let authenticationCreated = false;
    let authenticationUpdated = false;

    if (adminCreatingAnotherUser) {
      authUser = await getAuthUserByEmail(auth, requestedEmail);
      if (authUser) {
        if (normalizeEmail(authUser.email) === ADMIN_EMAIL) {
          throw publicError("No se puede modificar la cuenta del administrador central.", 400, "admin-account-protected");
        }
        const updateRequest = {
          email: requestedEmail,
          password,
          disabled: false,
        };
        if (name || authUser.displayName) updateRequest.displayName = name || authUser.displayName;
        authUser = await auth.updateUser(authUser.uid, updateRequest);
        authenticationUpdated = true;
      } else {
        const createRequest = {
          email: requestedEmail,
          password,
          disabled: false,
        };
        if (name) createRequest.displayName = name;
        authUser = await auth.createUser(createRequest);
        authenticationCreated = true;
      }
    } else {
      if (!decoded.uid) throw publicError("La sesión no contiene un UID válido.", 401, "missing-auth-uid");
      authUser = await auth.getUser(decoded.uid);
      const authenticatedEmail = normalizeEmail(authUser.email || callerEmail);
      if (!authenticatedEmail || authenticatedEmail !== requestedEmail) {
        throw publicError("El correo no coincide con la sesión autenticada.", 403, "authenticated-email-mismatch");
      }
      if (name && name !== clean(authUser.displayName)) {
        authUser = await auth.updateUser(authUser.uid, { displayName: name });
        authenticationUpdated = true;
      }
    }

    const uid = clean(authUser?.uid);
    const finalEmail = normalizeEmail(authUser?.email || requestedEmail);
    if (!uid || !finalEmail) {
      throw publicError("Firebase Authentication no devolvió un usuario válido.", 500, "missing-created-user");
    }

    const db = admin.firestore(app);
    const root = dataRoot(db);
    const profileRef = root.collection(STAFF_USERS_COLLECTION).doc(uid);
    const existingProfileSnapshot = await profileRef.get();
    const existingProfile = existingProfileSnapshot.exists ? existingProfileSnapshot.data() || {} : {};
    const now = Date.now();
    const profile = buildProfile({
      uid,
      email: finalEmail,
      name,
      phone,
      existing: existingProfile,
      now,
      actorEmail: callerEmail || finalEmail,
    });

    try {
      await profileRef.set(profile, { merge: true });
    } catch (profileWriteError) {
      // Evita volver a dejar una cuenta huérfana en Authentication cuando
      // la cuenta fue creada en esta misma petición pero Firestore falló.
      if (authenticationCreated) {
        try {
          await auth.deleteUser(uid);
        } catch (rollbackError) {
          console.error("No se pudo retirar la cuenta incompleta de Authentication:", rollbackError);
        }
      }
      const error = publicError(
        "No se pudo guardar el perfil del usuario en Firestore.",
        500,
        "profile-write-failed"
      );
      error.cause = profileWriteError;
      throw error;
    }

    let walletReady = true;
    try {
      await ensureWallet(db, root, uid, profile, callerEmail || finalEmail);
    } catch (walletError) {
      // El perfil ya quedó válido. La aplicación vuelve a intentar crear la
      // cartera al iniciar sesión, por lo que este fallo no bloquea el acceso.
      walletReady = false;
      console.error("No se pudo preparar la cartera inicial del usuario:", walletError);
    }

    return res.status(200).json({
      success: true,
      uid,
      email: finalEmail,
      authenticationCreated,
      authenticationUpdated,
      profileCreated: !existingProfileSnapshot.exists,
      walletReady,
      profile,
    });
  } catch (error) {
    console.error("Error creando o reparando usuario:", error);

    let statusCode = Number(error?.statusCode || 500);
    let code = clean(error?.code || "create-user-failed");
    let message = clean(error?.message || "No se pudo crear o reparar el usuario.");

    if (code === "auth/email-already-exists") {
      statusCode = 409;
      message = "El correo ya existe en Authentication.";
    } else if (code === "auth/invalid-password") {
      statusCode = 400;
      message = "La contraseña no es válida.";
    } else if (code === "auth/invalid-email") {
      statusCode = 400;
      message = "El correo electrónico no es válido.";
    } else if (code === "app/invalid-credential" || code.includes("credential")) {
      statusCode = 500;
      message = "Firebase Admin no está configurado correctamente en Vercel.";
      code = "firebase-admin-not-configured";
    }

    return res.status(statusCode).json({ success: false, code, error: message });
  }
};
