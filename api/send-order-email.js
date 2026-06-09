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

function normalizeProducts(primaryProduct = {}, products = []) {
  const sourceProducts = Array.isArray(products) && products.length > 0 ? products : [primaryProduct];
  return sourceProducts
    .filter(Boolean)
    .map((item) => ({
      id: clean(item.id),
      name: clean(item.name),
      price: Number(item.price || 0),
      ownerId: clean(item.ownerId || item.sellerId),
      ownerName: clean(item.ownerName || item.sellerName),
      ownerEmail: clean(item.ownerEmail || item.sellerEmail),
      ownerPhone: clean(item.ownerPhone || item.sellerPhone),
      saleNotificationEmail: clean(item.saleNotificationEmail || item.sellerNotificationEmail || item.notificationEmail || item.ownerNotificationEmail),
      sellerNotificationEmail: clean(item.sellerNotificationEmail || item.saleNotificationEmail || item.notificationEmail || item.ownerNotificationEmail),
    }))
    .filter((item) => item.id || item.name);
}

function getProductsTotal(products = []) {
  return products.reduce((total, item) => total + Number(item.price || 0), 0);
}

function renderProductsTable(products = []) {
  const rows = products
    .map((item, index) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.id)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${Number(item.price || 0).toFixed(2)}</td>
      </tr>
    `)
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">#</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">ID</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Producto</th>
          <th style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;">Precio</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:10px 8px;text-align:right;font-weight:bold;">Total acumulado</td>
          <td style="padding:10px 8px;text-align:right;font-weight:bold;color:#dc2626;">$${getProductsTotal(products).toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderDeliveryDetails(delivery = {}) {
  return `
    <p><b>Calle:</b> ${escapeHtml(delivery.street)}</p>
    <p><b>Estado:</b> ${escapeHtml(delivery.state)}</p>
    <p><b>Municipio:</b> ${escapeHtml(delivery.municipality)}</p>
    <p><b>Colonia:</b> ${escapeHtml(delivery.neighborhood)}</p>
    <p><b>Código Postal:</b> ${escapeHtml(delivery.zip)}</p>
    <p><b>Nombre completo:</b> ${escapeHtml(delivery.fullName)}</p>
    <p><b>Teléfono:</b> ${escapeHtml(delivery.phone)}</p>
    <p><b>Correo electrónico:</b> ${escapeHtml(delivery.email)}</p>
    <p><b>Referencias:</b> ${escapeHtml(delivery.references)}</p>
  `;
}

function buildSaleNotificationRequests({ orderProducts, primaryProduct, saleNotification, saleNotifications }) {
  if (Array.isArray(saleNotifications) && saleNotifications.length > 0) {
    return saleNotifications
      .map((item) => {
        const notificationProducts = normalizeProducts({}, item.products);
        return {
          to: clean(item.to),
          message: clean(item.message) || SALE_NOTIFICATION_MESSAGE,
          sellerName: clean(item.sellerName),
          products: notificationProducts.length > 0 ? notificationProducts : orderProducts,
        };
      })
      .filter((item) => item.to);
  }

  const grouped = new Map();
  orderProducts.forEach((item) => {
    const to = clean(item.sellerNotificationEmail || item.saleNotificationEmail || item.notificationEmail || item.ownerNotificationEmail);
    if (!to) return;
    const current = grouped.get(to) || {
      to,
      message: clean(saleNotification.message) || SALE_NOTIFICATION_MESSAGE,
      sellerName: clean(item.ownerName || item.sellerName),
      products: [],
    };
    current.products.push(item);
    grouped.set(to, current);
  });

  if (grouped.size > 0) return Array.from(grouped.values());

  const legacyEmail = clean(
    saleNotification.to ||
      primaryProduct.sellerNotificationEmail ||
      primaryProduct.saleNotificationEmail ||
      primaryProduct.notificationEmail ||
      primaryProduct.ownerNotificationEmail
  );

  if (!legacyEmail) return [];
  return [{
    to: legacyEmail,
    message: clean(saleNotification.message) || SALE_NOTIFICATION_MESSAGE,
    sellerName: clean(saleNotification.sellerName || primaryProduct.ownerName || primaryProduct.sellerName),
    products: orderProducts,
  }];
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

    const orderProducts = normalizeProducts(product, products);
    const invalidProduct = orderProducts.find((item) => !clean(item.id) || !clean(item.name));

    if (orderProducts.length === 0 || invalidProduct) {
      return res.status(400).json({ success: false, error: "Faltan datos del producto." });
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

    for (const [key, label] of Object.entries(requiredDelivery)) {
      if (!clean(delivery[key])) {
        return res.status(400).json({ success: false, error: `Falta el campo: ${label}.` });
      }
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });

    const productSubject = orderProducts.length > 1
      ? `${orderProducts.length} productos`
      : clean(orderProducts[0].name);

    const html = `
      <div style="font-family: Arial, sans-serif; color:#111827;">
        <h2>Nueva solicitud de compra</h2>

        <h3>Productos</h3>
        ${renderProductsTable(orderProducts)}

        <hr />

        <h3>Datos de entrega</h3>
        ${renderDeliveryDetails(delivery)}
      </div>
    `;

    await transporter.sendMail({
      from: `"Drive MX" <${senderEmail}>`,
      to: receiverEmail,
      subject: `Nueva compra - ${productSubject}`,
      html,
      replyTo: clean(delivery.email),
    });

    const notificationRequests = buildSaleNotificationRequests({
      orderProducts,
      primaryProduct: product,
      saleNotification,
      saleNotifications,
    });

    let saleNotificationSent = false;
    let saleNotificationCount = 0;
    const saleNotificationErrors = [];

    for (const notification of notificationRequests) {
      const saleNotificationEmail = clean(notification.to);
      if (!isValidEmail(saleNotificationEmail)) {
        saleNotificationErrors.push(`El correo de notificación de venta no es válido: ${saleNotificationEmail || "sin correo"}.`);
        continue;
      }

      const saleProducts = Array.isArray(notification.products) && notification.products.length > 0
        ? notification.products
        : orderProducts;
      const saleMessage = clean(notification.message) || SALE_NOTIFICATION_MESSAGE;
      const saleHtml = `
        <div style="font-family: Arial, sans-serif; color:#111827;">
          <p>${escapeHtml(saleMessage)}</p>

          <h3>Productos vendidos</h3>
          ${renderProductsTable(saleProducts)}

          <hr />

          <h3>Información del comprador</h3>
          ${renderDeliveryDetails(delivery)}
        </div>
      `;

      try {
        await transporter.sendMail({
          from: `"Drive MX" <${senderEmail}>`,
          to: saleNotificationEmail,
          subject: "Tu producto ha sido vendido - Drive MX",
          text: saleMessage,
          html: saleHtml,
        });
        saleNotificationSent = true;
        saleNotificationCount += 1;
      } catch (saleError) {
        console.error("Error enviando notificación de venta:", saleError);
        saleNotificationErrors.push(saleError.message || "No se pudo enviar la notificación de venta.");
      }
    }

    return res.status(200).json({
      success: true,
      saleNotificationSent,
      saleNotificationCount,
      saleNotificationError: saleNotificationErrors.join(" "),
    });
  } catch (error) {
    console.error("Error enviando correo:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "No se pudo enviar el correo.",
    });
  }
};


