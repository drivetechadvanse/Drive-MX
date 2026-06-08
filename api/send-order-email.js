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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
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
    const { mailSettings = {}, product = {}, delivery = {}, saleNotification = {} } = req.body || {};

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

    if (!clean(product.id) || !clean(product.name)) {
      return res.status(400).json({ success: false, error: "Faltan datos del producto." });
    }

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

    const html = `
      <div style="font-family: Arial, sans-serif; color:#111827;">
        <h2>Nueva solicitud de compra</h2>

        <h3>Producto</h3>
        <p><b>ID:</b> ${escapeHtml(product.id)}</p>
        <p><b>Nombre:</b> ${escapeHtml(product.name)}</p>
        <p><b>Precio:</b> $${Number(product.price || 0).toFixed(2)}</p>

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
      subject: `Nueva compra - ${clean(product.name)}`,
      html,
      replyTo: clean(delivery.email),
    });

    let saleNotificationSent = false;
    let saleNotificationError = "";
    const saleNotificationEmail = clean(
      saleNotification.to ||
      product.sellerNotificationEmail ||
      product.saleNotificationEmail ||
      product.notificationEmail ||
      product.ownerNotificationEmail
    );

    if (saleNotificationEmail) {
      if (!isValidEmail(saleNotificationEmail)) {
        saleNotificationError = "El correo de notificación de venta no es válido.";
      } else {
        const saleMessage = clean(saleNotification.message) || SALE_NOTIFICATION_MESSAGE;
        const saleHtml = `
          <div style="font-family: Arial, sans-serif; color:#111827;">
            <p>${escapeHtml(saleMessage)}</p>
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
        } catch (saleError) {
          console.error("Error enviando notificación de venta:", saleError);
          saleNotificationError = saleError.message || "No se pudo enviar la notificación de venta.";
        }
      }
    }

    return res.status(200).json({ success: true, saleNotificationSent, saleNotificationError });
  } catch (error) {
    console.error("Error enviando correo:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "No se pudo enviar el correo.",
    });
  }
};

