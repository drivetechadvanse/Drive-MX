const nodemailer = require("nodemailer");

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

function normalizeList(value) {
  const raw = Array.isArray(value) ? value : clean(value).split(/[\n,;|]+/);
  const seen = new Set();
  return raw
    .map((item) => clean(item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getProductSizes(item = {}) {
  const allowed = ["Chica", "Mediana", "Grande", "XL"];
  const requested = normalizeList(
    item.sizes ?? item.tallas ?? item.productSizes ?? item.productTallas ?? item.size ?? item.talla ?? []
  );
  return requested
    .map((size) => allowed.find((option) => option.toLowerCase() === size.toLowerCase()) || "")
    .filter(Boolean);
}

function getProductColors(item = {}) {
  return normalizeList(
    item.colors ?? item.colores ?? item.productColors ?? item.productColores ?? item.color ?? ""
  );
}

function productOptionsHtml(item = {}) {
  const parts = [];
  if (Array.isArray(item.sizes) && item.sizes.length) {
    parts.push(`<p><b>Tallas:</b> ${escapeHtml(item.sizes.join(", "))}</p>`);
  }
  if (Array.isArray(item.colors) && item.colors.length) {
    parts.push(`<p><b>Colores:</b> ${escapeHtml(item.colors.join(", "))}</p>`);
  }
  return parts.join("");
}

function productOptionsText(item = {}) {
  return [
    Array.isArray(item.sizes) && item.sizes.length ? `Tallas: ${item.sizes.join(", ")}` : "",
    Array.isArray(item.colors) && item.colors.length ? `Colores: ${item.colors.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeProducts(product = {}, products = []) {
  const source = Array.isArray(products) && products.length > 0 ? products : [product];
  return source
    .filter(Boolean)
    .map((item) => ({
      id: clean(item.id),
      name: clean(item.name),
      price: Number(item.price || 0),
      ownerId: clean(item.ownerId),
      ownerName: clean(item.ownerName),
      ownerEmail: clean(item.ownerEmail),
      ownerPhone: clean(item.ownerPhone),
      sellerNotificationEmail: clean(item.sellerNotificationEmail),
      saleNotificationEmail: clean(item.saleNotificationEmail),
      notificationEmail: clean(item.notificationEmail),
      ownerNotificationEmail: clean(item.ownerNotificationEmail),
      sizes: getProductSizes(item),
      tallas: getProductSizes(item),
      colors: getProductColors(item),
      colores: getProductColors(item),
    }))
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
          <p><b>Precio:</b> $${money(item.price)}</p>
          ${productOptionsHtml(item)}
        </div>
      `
    )
    .join("");
}

function productsText(orderProducts = []) {
  return orderProducts
    .map((item, index) => {
      const options = productOptionsText(item);
      return `Producto ${index + 1}\nID: ${item.id}\nNombre: ${item.name}\nPrecio: $${money(item.price)}${options ? `\n${options}` : ""}`;
    })
    .join("\n\n");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido." });
  }

  try {
    const {
      mailSettings = {},
      product = {},
      products = [],
      cart = {},
      delivery = {},
      saleNotification = {},
      saleNotifications = [],
    } = req.body || {};

    const senderEmail = clean(mailSettings.senderEmail);
    const appPassword = clean(mailSettings.appPassword);
    const receiverEmail = clean(mailSettings.receiverEmail);

    if (!senderEmail || !appPassword || !receiverEmail) {
      return res.status(400).json({
        success: false,
        error: "Falta configuración de correo: remitente, contraseña de aplicación o correo base receptor.",
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
      return res.status(400).json({ success: false, error: "Faltan datos del producto." });
    }

    if (orderProducts.length > 2) {
      return res.status(400).json({ success: false, error: "El carrito permite máximo 2 productos por compra." });
    }

    for (const [key, label] of Object.entries(requiredDelivery)) {
      if (!clean(delivery[key])) {
        return res.status(400).json({ success: false, error: `Falta el campo: ${label}.` });
      }
    }

    const orderTotal = orderProducts.reduce((total, item) => total + Number(item.price || 0), 0);
    const itemCount = Number(cart.itemCount || orderProducts.length);
    const productSubject = orderProducts.length > 1 ? `${orderProducts.length} productos` : orderProducts[0].name;

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
      from: `"Drive MX" <${senderEmail}>`,
      to: receiverEmail,
      subject: `Nueva compra - ${productSubject}`,
      html,
      replyTo: clean(delivery.email),
    });

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
      if (!target.to || targetsByEmail.has(target.to.toLowerCase())) return;
      targetsByEmail.set(target.to.toLowerCase(), target);
    });

    let saleNotificationSent = false;
    let saleNotificationCount = 0;
    const saleNotificationErrors = [];

    const saleProductsHtml = productsHtml(orderProducts);
    const saleProductsText = productsText(orderProducts);

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
      )}\n\nComprador:\nNombre: ${clean(delivery.fullName)}\nTeléfono: ${clean(
        delivery.phone
      )}\nCorreo: ${clean(delivery.email)}\nReferencias: ${clean(delivery.references)}`;

      try {
        await transporter.sendMail({
          from: `"Drive MX" <${senderEmail}>`,
          to: target.to,
          subject: "Tu producto ha sido vendido - Drive MX",
          text: saleText,
          html: saleHtml,
        });
        saleNotificationSent = true;
        saleNotificationCount += 1;
      } catch (saleError) {
        console.error("Error enviando notificación de venta:", saleError);
        saleNotificationErrors.push(
          `${target.to}: ${saleError.message || "No se pudo enviar la notificación de venta."}`
        );
      }
    }

    return res.status(200).json({
      success: true,
      saleNotificationSent,
      saleNotificationCount,
      saleNotificationError: saleNotificationErrors.join(" | "),
    });
  } catch (error) {
    console.error("Error enviando correo:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "No se pudo enviar el correo.",
    });
  }
};







