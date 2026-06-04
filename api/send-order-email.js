const nodemailer = require("nodemailer");

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido." });
  }

  try {
    const { mailSettings = {}, product = {}, delivery = {} } = req.body || {};

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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error enviando correo:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "No se pudo enviar el correo.",
    });
  }
};
