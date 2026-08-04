const nodemailer = require("nodemailer");
const SupermercadoEmail = require("../supermercado-module/supermercado-email.js");

const SALE_NOTIFICATION_MESSAGE =
  "Tu producto ha sido vendido. Comunícate al 5633535701 o 5617549756 para la recolección de tu paquete.";

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeQuantity(value) {
  const numeric = Math.floor(Number(value || 1));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

const PRODUCT_SIZE_OPTIONS = ['Chica', 'Mediana', 'Grande', 'XL'];

function normalizeProductSizes(sizes = []) {
  return Array.isArray(sizes) ? sizes.map(clean).filter((size) => PRODUCT_SIZE_OPTIONS.includes(size)) : [];
}

function normalizeProductColors(colors = []) {
  return Array.isArray(colors) ? colors.map(clean).filter(Boolean) : [];
}

function productOptionsHtml(item = {}) {
  const sizes = normalizeProductSizes(item.sizes || item.medidas).join(', ');
  const colors = normalizeProductColors(item.colors || item.colores).join(', ');
  return `${sizes ? `<p><b>Medidas:</b> ${escapeHtml(sizes)}</p>` : ''}${colors ? `<p><b>Colores:</b> ${escapeHtml(colors)}</p>` : ''}`;
}

function productOptionsText(item = {}) {
  const lines = [];
  const sizes = normalizeProductSizes(item.sizes || item.medidas).join(', ');
  const colors = normalizeProductColors(item.colors || item.colores).join(', ');
  if (sizes) lines.push(`Medidas: ${sizes}`);
  if (colors) lines.push(`Colores: ${colors}`);
  return lines.join('\n');
}

function normalizeProducts(product = {}, products = []) {
  const source = Array.isArray(products) && products.length > 0 ? products : [product];
  return source
    .filter(Boolean)
    .map((item) => {
      const quantity = normalizeQuantity(item.quantity || item.productQuantity || item.selectedQuantity || 1);
      const unitPrice = Number(item.unitPrice ?? item.productUnitPrice ?? item.price ?? 0);
      const lineTotal = roundMoney(
        item.lineTotal ?? item.totalPrice ?? item.productTotal ?? item.productCost ?? unitPrice * quantity
      );
      return SupermercadoEmail.copyCategory({
        id: clean(item.id),
        name: clean(item.name),
        price: unitPrice,
        unitPrice,
        productUnitPrice: unitPrice,
        quantity,
        productQuantity: quantity,
        lineTotal,
        totalPrice: lineTotal,
        productTotal: lineTotal,
        sizes: normalizeProductSizes(item.sizes || item.medidas),
        colors: normalizeProductColors(item.colors || item.colores),
        ownerId: clean(item.ownerId),
        ownerName: clean(item.ownerName),
        ownerEmail: clean(item.ownerEmail),
        ownerPhone: clean(item.ownerPhone),
        sellerNotificationEmail: clean(item.sellerNotificationEmail),
        saleNotificationEmail: clean(item.saleNotificationEmail),
        notificationEmail: clean(item.notificationEmail),
        ownerNotificationEmail: clean(item.ownerNotificationEmail),
      }, item);
    })
    .filter((item) => item.id && item.name);
}

function productsHtml(orderProducts = []) {
  return orderProducts
    .map(
      (item, index) => `
        <div style="padding:12px 0; border-bottom:1px solid #e5e7eb;">
          <p><b>Producto ${index + 1}</b></p>
          <p><b>ID:</b> ${escapeHtml(item.id)}</p>
          <p><b>Nombre:</b> ${escapeHtml(item.name)}</p>
          <p><b>Cantidad comprada:</b> ${Number(item.quantity || 1)}</p>
          <p><b>Precio unitario:</b> $${money(item.unitPrice ?? item.price)}</p>
          <p><b>Total del producto:</b> $${money(item.lineTotal ?? item.totalPrice ?? item.productTotal)}</p>
          ${productOptionsHtml(item)}
        </div>
      `
    )
    .join("");
}

function productsText(orderProducts = []) {
  return orderProducts
    .map(
      (item, index) =>
        `Producto ${index + 1}\nID: ${item.id}\nNombre: ${item.name}\nCantidad comprada: ${Number(item.quantity || 1)}\nPrecio unitario: $${money(item.unitPrice ?? item.price)}\nTotal del producto: $${money(item.lineTotal ?? item.totalPrice ?? item.productTotal)}${productOptionsText(item) ? `\n${productOptionsText(item)}` : ''}`
    )
    .join("\n\n");
}

function normalizeAppPassword(value) {
  return clean(value).replace(/\s+/g, "");
}

function resolveMailSettings(mailSettings = {}) {
  const requestSenderEmail = clean(mailSettings.senderEmail);
  const requestAppPassword = normalizeAppPassword(mailSettings.appPassword);
  const requestReceiverEmail = clean(mailSettings.receiverEmail);
  const requestHasAuthValue = Boolean(requestSenderEmail || requestAppPassword);

  // El sistema original administra estas credenciales desde el panel y Firestore.
  // Cuando la solicitud contiene correo y contraseña, deben usarse como un par y
  // nunca ser reemplazados ni mezclados con variables antiguas del servidor.
  const environmentAuthCandidates = [
    {
      senderEmail: clean(process.env.DRIVE_MX_SENDER_EMAIL),
      appPassword: normalizeAppPassword(process.env.DRIVE_MX_GMAIL_APP_PASSWORD),
      source: "variables-entorno:DRIVE_MX",
    },
    {
      senderEmail: clean(process.env.GMAIL_USER),
      appPassword: normalizeAppPassword(process.env.GMAIL_APP_PASSWORD),
      source: "variables-entorno:GMAIL",
    },
    {
      senderEmail: clean(process.env.EMAIL_USER),
      appPassword: normalizeAppPassword(process.env.EMAIL_APP_PASSWORD),
      source: "variables-entorno:EMAIL",
    },
  ];
  const environmentAuth = environmentAuthCandidates.find(
    (candidate) => candidate.senderEmail && candidate.appPassword
  );

  let senderEmail = requestSenderEmail;
  let appPassword = requestAppPassword;
  let authSource = "panel";

  // Solo se usa el respaldo del servidor cuando la solicitud no contiene ningún
  // dato de autenticación. Si llega un par incompleto, la validación lo reporta
  // en lugar de combinar credenciales de cuentas diferentes.
  if (!requestHasAuthValue && environmentAuth) {
    senderEmail = environmentAuth.senderEmail;
    appPassword = environmentAuth.appPassword;
    authSource = environmentAuth.source;
  } else if (requestHasAuthValue && (!requestSenderEmail || !requestAppPassword)) {
    authSource = "panel-incompleto";
  }

  const environmentReceiverCandidates = [
    clean(process.env.DRIVE_MX_ORDER_RECEIVER_EMAIL),
    clean(process.env.ORDER_RECEIVER_EMAIL),
    clean(process.env.EMAIL_RECEIVER),
  ];
  const environmentReceiverEmail = environmentReceiverCandidates.find(Boolean) || "";
  const receiverEmail = requestReceiverEmail || environmentReceiverEmail;

  return {
    senderEmail,
    appPassword,
    receiverEmail,
    authSource,
    receiverSource: requestReceiverEmail ? "panel" : environmentReceiverEmail ? "variables-entorno" : "sin-configurar",
  };
}

function maskEmail(value) {
  const email = clean(value);
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "correo-no-disponible";
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? "***" : "*"}@${domain}`;
}

function mailErrorDetails(error = {}) {
  return {
    name: error?.name || "Error",
    code: error?.code || "",
    command: error?.command || "",
    responseCode: error?.responseCode || null,
    response: clean(error?.response).slice(0, 500),
    message: error?.message || String(error || "Error desconocido"),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido." });
  }

  const requestBody = req.body || {};
  const requestId = clean(
    requestBody.requestId || requestBody.transferId || `email_${Date.now()}`
  );
  let stage = "validacion";
  let baseEmailSent = false;
  let baseMessageId = "";
  let mailContext = {
    authSource: "sin-resolver",
    receiverSource: "sin-resolver",
    sender: "correo-no-disponible",
    receiver: "correo-no-disponible",
  };

  try {
    const {
      mailSettings = {},
      product = {},
      products = [],
      cart = {},
      delivery = {},
      saleNotification = {},
      saleNotifications = [],
      transferId = "",
      paymentStatus = "",
    } = requestBody;

    const {
      senderEmail,
      appPassword,
      receiverEmail,
      authSource,
      receiverSource,
    } = resolveMailSettings(mailSettings);
    mailContext = {
      authSource,
      receiverSource,
      sender: maskEmail(senderEmail),
      receiver: maskEmail(receiverEmail),
    };

    if (!senderEmail || !appPassword || !receiverEmail) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "MAIL_SETTINGS_MISSING",
        authSource,
        receiverSource,
        error:
          "Falta configuración de correo: remitente, contraseña de aplicación o correo base receptor.",
      });
    }
    if (!isValidEmail(senderEmail)) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "MAIL_SENDER_INVALID",
        error: "El correo remitente configurado no es válido.",
      });
    }
    if (!isValidEmail(receiverEmail)) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "MAIL_RECEIVER_INVALID",
        error: "El correo base receptor configurado no es válido.",
      });
    }

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

    const orderProducts = normalizeProducts(product, products);

    if (orderProducts.length === 0) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "ORDER_PRODUCTS_MISSING",
        error: "Faltan datos del producto.",
      });
    }

    if (orderProducts.length > 2) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "ORDER_PRODUCTS_LIMIT",
        error: "El carrito permite máximo 2 productos por compra.",
      });
    }

    for (const [key, label] of Object.entries(requiredDelivery)) {
      if (!clean(delivery[key])) {
        return res.status(400).json({
          success: false,
          requestId,
          stage,
          code: "DELIVERY_FIELD_MISSING",
          field: key,
          error: `Falta el campo: ${label}.`,
        });
      }
    }
    if (!isValidEmail(delivery.email)) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "DELIVERY_EMAIL_INVALID",
        error: "El correo electrónico del comprador no es válido.",
      });
    }

    const SHIPPING_FEE = 150;
    const orderSubtotal = orderProducts.reduce(
      (total, item) => total + Number(item.lineTotal ?? item.totalPrice ?? item.productTotal ?? item.price ?? 0),
      0
    );
    const orderShippingFee = Number(
      cart.shippingFee ?? (orderProducts.length > 0 ? SHIPPING_FEE : 0)
    );
    const orderTotal = Number(cart.total ?? orderSubtotal + orderShippingFee);
    const totalQuantity = orderProducts.reduce((total, item) => total + Number(item.quantity || 1), 0);
    const itemCount = Number(cart.totalQuantity || cart.quantityTotal || totalQuantity || cart.itemCount || orderProducts.length);
    const productSubject =
      orderProducts.length > 1 ? `${orderProducts.length} productos` : orderProducts[0].name;

    const inferredTargets = orderProducts
      .map((item) => ({
        to: clean(
          item.sellerNotificationEmail ||
            item.saleNotificationEmail ||
            item.notificationEmail ||
            item.ownerNotificationEmail
        ),
        message: SALE_NOTIFICATION_MESSAGE,
        sellerName: item.ownerName,
        productName: item.name,
        productId: item.id,
      }))
      .filter((target) => target.to);

    const explicitTargets = Array.isArray(saleNotifications)
      ? saleNotifications.map((target) => ({
          to: clean(target.to || target.email),
          message: clean(target.message) || SALE_NOTIFICATION_MESSAGE,
          sellerName: clean(target.sellerName),
          productName: clean(target.productName),
          productId: clean(target.productId),
        }))
      : [];

    const legacyTargetEmail = clean(
      saleNotification.to ||
        product.sellerNotificationEmail ||
        product.saleNotificationEmail ||
        product.notificationEmail ||
        product.ownerNotificationEmail
    );

    const legacyTargets = legacyTargetEmail
      ? [
          {
            to: legacyTargetEmail,
            message: clean(saleNotification.message) || SALE_NOTIFICATION_MESSAGE,
            sellerName: clean(saleNotification.sellerName),
            productName: clean(saleNotification.productName || product.name),
            productId: clean(saleNotification.productId || product.id),
          },
        ]
      : [];

    const targetsByEmail = new Map();
    [...explicitTargets, ...inferredTargets, ...legacyTargets].forEach((target) => {
      const targetKey = clean(target.to).toLowerCase();
      if (!targetKey || targetsByEmail.has(targetKey)) return;
      targetsByEmail.set(targetKey, target);
    });

    const invalidTargets = [...targetsByEmail.values()]
      .filter((target) => !isValidEmail(target.to))
      .map((target) => maskEmail(target.to));
    if (invalidTargets.length > 0) {
      return res.status(400).json({
        success: false,
        requestId,
        stage,
        code: "SALE_NOTIFICATION_EMAIL_INVALID",
        invalidTargets,
        error: "Existe uno o más correos de notificación de venta no válidos.",
      });
    }

    console.info("[send-order-email] Solicitud validada.", {
      requestId,
      transferId: clean(transferId),
      paymentStatus: clean(paymentStatus),
      productCount: orderProducts.length,
      sender: maskEmail(senderEmail),
      receiver: maskEmail(receiverEmail),
      authSource,
      receiverSource,
      saleNotificationTargets: targetsByEmail.size,
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; color:#111827;">
        <h2>Nueva solicitud de compra</h2>

        <h3>Productos</h3>
        ${productsHtml(orderProducts)}
        <p><b>Subtotal productos:</b> $${money(orderSubtotal)}</p>
        <p><b>Gastos de envío:</b> $${money(orderShippingFee)}</p>
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

    stage = "correo-base";
    const baseInfo = await transporter.sendMail({
      from: `"Drive MX" <${senderEmail}>`,
      to: receiverEmail,
      subject: `Nueva compra - ${productSubject}`,
      html,
      replyTo: clean(delivery.email),
    });
    baseEmailSent = true;
    baseMessageId = clean(baseInfo?.messageId);
    console.info("[send-order-email] Correo base enviado.", {
      requestId,
      receiver: maskEmail(receiverEmail),
      messageId: baseMessageId,
    });

    let saleNotificationCount = 0;
    const saleNotificationErrors = [];
    const saleProductsHtml = productsHtml(orderProducts);
    const saleProductsText = productsText(orderProducts);

    stage = "notificaciones-venta";
    for (const target of targetsByEmail.values()) {
      const saleMessage = clean(target.message) || SALE_NOTIFICATION_MESSAGE;
      const saleHtml = `
        <div style="font-family: Arial, sans-serif; color:#111827;">
          <p>${escapeHtml(saleMessage).replace(/\n/g, "<br />")}</p>

          <h3>Productos de la compra</h3>
          ${saleProductsHtml}
          <p><b>Subtotal productos:</b> $${money(orderSubtotal)}</p>
          <p><b>Gastos de envío:</b> $${money(orderShippingFee)}</p>
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

      const saleText = `${saleMessage}\n\nProductos de la compra:\n${saleProductsText}\n\nSubtotal productos: $${money(
        orderSubtotal
      )}\nGastos de envío: $${money(orderShippingFee)}\nTotal acumulado: $${money(
        orderTotal
      )}\nCantidad total comprada: ${itemCount}\n\nComprador:\nNombre: ${clean(delivery.fullName)}\nTeléfono: ${clean(
        delivery.phone
      )}\nCorreo: ${clean(delivery.email)}\nReferencias: ${clean(delivery.references)}`;

      try {
        const saleInfo = await transporter.sendMail({
          from: `"Drive MX" <${senderEmail}>`,
          to: target.to,
          subject: "Tu producto ha sido vendido - Drive MX",
          text: saleText,
          html: saleHtml,
        });
        saleNotificationCount += 1;
        console.info("[send-order-email] Notificación de venta enviada.", {
          requestId,
          recipient: maskEmail(target.to),
          messageId: clean(saleInfo?.messageId),
        });
      } catch (saleError) {
        const details = mailErrorDetails(saleError);
        console.error("[send-order-email] Error enviando notificación de venta.", {
          requestId,
          recipient: maskEmail(target.to),
          ...details,
        }, saleError);
        saleNotificationErrors.push({
          recipient: maskEmail(target.to),
          ...details,
        });
      }
    }

    const supermarketBuyerNotification = SupermercadoEmail.buildBuyerNotification({
      orderProducts,
      delivery,
      cart: {
        ...cart,
        subtotal: orderSubtotal,
        shippingFee: orderShippingFee,
        total: orderTotal,
      },
      transferId,
      paymentStatus,
    });
    const supermarketBuyerNotificationRequired = Boolean(supermarketBuyerNotification);
    let supermarketBuyerNotificationSent = false;
    let supermarketBuyerNotificationCount = 0;
    let supermarketBuyerNotificationError = null;

    if (supermarketBuyerNotification) {
      stage = "notificacion-comprador-supermercado";
      try {
        const buyerInfo = await transporter.sendMail({
          from: `"Drive MX" <${senderEmail}>`,
          to: supermarketBuyerNotification.to,
          subject: supermarketBuyerNotification.subject,
          text: supermarketBuyerNotification.text,
          html: supermarketBuyerNotification.html,
          replyTo: receiverEmail,
        });
        supermarketBuyerNotificationSent = true;
        supermarketBuyerNotificationCount = 1;
        console.info("[send-order-email] Confirmación de Supermercado enviada al comprador.", {
          requestId,
          recipient: maskEmail(supermarketBuyerNotification.to),
          productCount: supermarketBuyerNotification.productCount,
          messageId: clean(buyerInfo?.messageId),
        });
      } catch (buyerError) {
        supermarketBuyerNotificationError = mailErrorDetails(buyerError);
        console.error("[send-order-email] Error enviando confirmación de Supermercado al comprador.", {
          requestId,
          recipient: maskEmail(supermarketBuyerNotification.to),
          ...supermarketBuyerNotificationError,
        }, buyerError);
      }
    }

    if (saleNotificationErrors.length > 0 || supermarketBuyerNotificationError) {
      const bothFailed = saleNotificationErrors.length > 0 && Boolean(supermarketBuyerNotificationError);
      const code = bothFailed
        ? "SALE_AND_SUPERMARKET_BUYER_NOTIFICATION_PARTIAL_FAILURE"
        : saleNotificationErrors.length > 0
          ? "SALE_NOTIFICATION_PARTIAL_FAILURE"
          : "SUPERMARKET_BUYER_NOTIFICATION_FAILURE";
      const error = bothFailed
        ? "La compra fue notificada al correo base, pero fallaron notificaciones de venta y la confirmación de Supermercado al comprador."
        : saleNotificationErrors.length > 0
          ? "La compra fue notificada al correo base, pero falló una o más notificaciones de venta."
          : "La compra fue notificada al correo base y a los vendedores, pero falló la confirmación de Supermercado al comprador.";
      return res.status(502).json({
        success: false,
        partialSuccess: true,
        requestId,
        stage,
        code,
        baseEmailSent,
        baseMessageId,
        saleNotificationCount,
        saleNotificationErrors,
        supermarketBuyerNotificationRequired,
        supermarketBuyerNotificationSent,
        supermarketBuyerNotificationCount,
        supermarketBuyerNotificationError,
        error,
      });
    }

    return res.status(200).json({
      success: true,
      requestId,
      stage: "completado",
      baseEmailSent,
      baseMessageId,
      saleNotificationSent: saleNotificationCount > 0,
      saleNotificationCount,
      saleNotificationError: "",
      supermarketBuyerNotificationRequired,
      supermarketBuyerNotificationSent,
      supermarketBuyerNotificationCount,
      supermarketBuyerNotificationError: null,
    });
  } catch (error) {
    const details = mailErrorDetails(error);
    const authenticationRejected =
      details.code === "EAUTH" ||
      Number(details.responseCode) === 535 ||
      /535(?:-|\s)|username and password not accepted|invalid login/i.test(
        `${details.response} ${details.message}`
      );
    const responseStage = authenticationRejected ? "autenticacion-smtp" : stage;
    const responseCode = authenticationRejected
      ? "GMAIL_AUTH_REJECTED"
      : details.code || "EMAIL_SEND_ERROR";
    const responseMessage = authenticationRejected
      ? `Google rechazó la autenticación SMTP del remitente ${mailContext.sender}. Se usaron las credenciales configuradas desde ${mailContext.authSource}. Verifica que el correo remitente y la contraseña de aplicación pertenezcan a la misma cuenta.`
      : details.message || "No se pudo enviar el correo.";

    console.error("[send-order-email] Error enviando correo.", {
      requestId,
      stage: responseStage,
      baseEmailSent,
      ...mailContext,
      ...details,
    }, error);
    return res.status(authenticationRejected ? 401 : 500).json({
      success: false,
      partialSuccess: baseEmailSent,
      requestId,
      stage: responseStage,
      code: responseCode,
      baseEmailSent,
      baseMessageId,
      authSource: mailContext.authSource,
      sender: mailContext.sender,
      responseCode: details.responseCode,
      error: responseMessage,
    });
  }
};







