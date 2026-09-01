const nodemailer = require("nodemailer");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LABEL_HEADER = "DriveMX Paqueteria";
const LABEL_ADDRESS = "3 de mayo colonia la pastoria 56304";
const LABEL_RFC = "GADC921121QU0";
const MAX_REQUEST_BYTES = 256 * 1024;
const GUIDE_CODE_PATTERN = /^\d{6}-[A-Z]$/;

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

function normalizeAppPassword(value) {
  return clean(value).replace(/\s+/g, "");
}

function resolveMailSettings(mailSettings = {}) {
  const requestSenderEmail = clean(mailSettings.senderEmail);
  const requestAppPassword = normalizeAppPassword(mailSettings.appPassword);
  const requestHasAuthValue = Boolean(requestSenderEmail || requestAppPassword);

  const environmentCandidates = [
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
  const environmentAuth = environmentCandidates.find(
    (candidate) => candidate.senderEmail && candidate.appPassword
  );

  if (!requestHasAuthValue && environmentAuth) {
    return {
      senderEmail: environmentAuth.senderEmail,
      appPassword: environmentAuth.appPassword,
      authSource: environmentAuth.source,
    };
  }

  return {
    senderEmail: requestSenderEmail,
    appPassword: requestAppPassword,
    authSource: requestHasAuthValue ? "panel" : "sin-configurar",
  };
}

function maskEmail(value) {
  const email = clean(value);
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "correo-no-disponible";
  return `${local.slice(0, 2)}${local.length > 2 ? "***" : "*"}@${domain}`;
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

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function normalizePdfText(value) {
  return clean(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function escapePdfLiteral(value) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function number(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function approximateTextWidth(value, fontSize) {
  return normalizePdfText(value).split("").reduce((total, character) => {
    if (character === " ") return total + fontSize * 0.32;
    if (/[MWÁÉÍÓÚÜÑ]/.test(character)) return total + fontSize * 0.9;
    if (/[A-Z0-9]/.test(character)) return total + fontSize * 0.68;
    if (/[ilI1.,:;!|]/.test(character)) return total + fontSize * 0.35;
    if (/[-_\/]/.test(character)) return total + fontSize * 0.4;
    return total + fontSize * 0.58;
  }, 0);
}

function splitLongWord(word, maxWidth, fontSize) {
  const parts = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && approximateTextWidth(candidate, fontSize) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(value, maxWidth, fontSize) {
  const text = normalizePdfText(value) || "-";
  const sourceWords = text.split(" ").filter(Boolean);
  const words = [];

  sourceWords.forEach((word) => {
    if (approximateTextWidth(word, fontSize) <= maxWidth) words.push(word);
    else words.push(...splitLongWord(word, maxWidth, fontSize));
  });

  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && approximateTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["-"];
}

function topToPdfY(top) {
  return PAGE_HEIGHT - top;
}

function addRectangle(commands, x, top, width, height, lineWidth = 1) {
  const y = PAGE_HEIGHT - top - height;
  commands.push(`${number(lineWidth)} w ${number(x)} ${number(y)} ${number(width)} ${number(height)} re S`);
}

function addLine(commands, x1, top1, x2, top2, lineWidth = 1) {
  commands.push(
    `${number(lineWidth)} w ${number(x1)} ${number(topToPdfY(top1))} m ${number(x2)} ${number(topToPdfY(top2))} l S`
  );
}

function addTextLine(commands, value, x, top, fontSize, fontName = "F1") {
  const baseline = top + fontSize;
  commands.push(
    `BT /${fontName} ${number(fontSize)} Tf ${number(x)} ${number(topToPdfY(baseline))} Td (${escapePdfLiteral(value)}) Tj ET`
  );
}

function addWrappedText(commands, value, x, top, width, fontSize, options = {}) {
  const lineHeight = Number(options.lineHeight || fontSize + 2);
  const fontName = options.fontName || "F1";
  const align = options.align || "left";
  const lines = wrapText(value, width, fontSize);

  lines.forEach((line, index) => {
    let lineX = x;
    if (align === "center") {
      lineX = x + Math.max(0, (width - approximateTextWidth(line, fontSize)) / 2);
    } else if (align === "right") {
      lineX = x + Math.max(0, width - approximateTextWidth(line, fontSize));
    }
    addTextLine(commands, line, lineX, top + index * lineHeight, fontSize, fontName);
  });

  return {
    lines,
    height: lines.length * lineHeight,
  };
}

function measureField(value, width, valueFontSize) {
  const innerWidth = Math.max(40, width - 18);
  const lineHeight = valueFontSize + 2;
  const lines = wrapText(value, innerWidth, valueFontSize);
  return Math.max(48, 31 + lines.length * lineHeight);
}

function drawField(commands, options = {}) {
  const {
    label,
    value,
    x,
    top,
    width,
    height,
    valueFontSize = 10,
  } = options;

  addRectangle(commands, x, top, width, height, 0.8);
  addTextLine(commands, String(label || "").toUpperCase(), x + 9, top + 7, 7.5, "F2");
  addWrappedText(commands, value || "-", x + 9, top + 23, width - 18, valueFontSize, {
    lineHeight: valueFontSize + 2,
    fontName: "F1",
  });
}

function normalizeShipment(rawShipment = {}) {
  const customer = rawShipment.customer && typeof rawShipment.customer === "object"
    ? rawShipment.customer
    : {};
  const guideCode = clean(rawShipment.guideCode || rawShipment.id || rawShipment.trackingNumber).toUpperCase();

  return {
    guideCode,
    fullName: clean(rawShipment.fullName || customer.fullName),
    phone: clean(rawShipment.phone || customer.phone),
    origin: clean(rawShipment.o || rawShipment.origin),
    destination: clean(rawShipment.d || rawShipment.destination),
    zip: clean(rawShipment.zip || rawShipment.postalCode),
    references: clean(rawShipment.references),
    assignedUserId: clean(rawShipment.assignedUserId || rawShipment.op),
    assignedUserName: clean(
      rawShipment.assignedUserName ||
        rawShipment.assignedUserDisplayName ||
        rawShipment.assignedUserEmail ||
        rawShipment.assignedUserId ||
        rawShipment.op
    ),
    productId: clean(rawShipment.productId),
    createdByEmail: clean(rawShipment.createdByEmail),
  };
}

function validateShipment(shipment = {}) {
  if (!GUIDE_CODE_PATTERN.test(shipment.guideCode)) {
    throw Object.assign(new Error("El número de guía no es válido."), { code: "LABEL_GUIDE_INVALID", status: 400 });
  }

  const requiredFields = [
    ["fullName", "nombre completo"],
    ["phone", "número de teléfono"],
    ["origin", "origen"],
    ["destination", "destino"],
    ["zip", "código postal"],
    ["references", "referencias del domicilio"],
  ];
  for (const [field, label] of requiredFields) {
    if (!clean(shipment[field])) {
      throw Object.assign(new Error(`Falta el campo ${label} para crear la etiqueta.`), {
        code: "LABEL_FIELD_MISSING",
        status: 400,
        field,
      });
    }
  }
}

function layoutLabel(shipment, valueFontSize = 10) {
  const commands = ["0 G", "0 g", "1 J", "1 j"];
  const pageMargin = 24;
  const contentX = 42;
  const contentWidth = PAGE_WIDTH - contentX * 2;
  const columnGap = 8;
  const columnWidth = (contentWidth - columnGap) / 2;

  addRectangle(commands, pageMargin, pageMargin, PAGE_WIDTH - pageMargin * 2, PAGE_HEIGHT - pageMargin * 2, 1.8);
  addWrappedText(commands, LABEL_HEADER, contentX, 39, contentWidth, 24, {
    lineHeight: 27,
    fontName: "F2",
    align: "center",
  });
  addWrappedText(commands, `Direccion: ${LABEL_ADDRESS}`, contentX, 75, contentWidth, 10.5, {
    lineHeight: 13,
    fontName: "F1",
    align: "center",
  });
  addWrappedText(commands, `RFC : ${LABEL_RFC}`, contentX, 94, contentWidth, 10.5, {
    lineHeight: 13,
    fontName: "F2",
    align: "center",
  });
  addLine(commands, contentX, 115, contentX + contentWidth, 115, 1.2);

  addRectangle(commands, contentX, 128, contentWidth, 88, 1.8);
  addWrappedText(commands, "NUMERO DE GUIA", contentX, 139, contentWidth, 11, {
    lineHeight: 14,
    fontName: "F2",
    align: "center",
  });
  addWrappedText(commands, shipment.guideCode, contentX, 161, contentWidth, 32, {
    lineHeight: 36,
    fontName: "F2",
    align: "center",
  });

  let top = 230;

  const nameHeight = measureField(shipment.fullName, columnWidth, valueFontSize);
  const phoneHeight = measureField(shipment.phone, columnWidth, valueFontSize);
  const firstRowHeight = Math.max(nameHeight, phoneHeight);
  drawField(commands, {
    label: "Nombre completo",
    value: shipment.fullName,
    x: contentX,
    top,
    width: columnWidth,
    height: firstRowHeight,
    valueFontSize,
  });
  drawField(commands, {
    label: "Número de teléfono",
    value: shipment.phone,
    x: contentX + columnWidth + columnGap,
    top,
    width: columnWidth,
    height: firstRowHeight,
    valueFontSize,
  });
  top += firstRowHeight + 8;

  const originHeight = measureField(shipment.origin, contentWidth, valueFontSize);
  drawField(commands, {
    label: "Origen",
    value: shipment.origin,
    x: contentX,
    top,
    width: contentWidth,
    height: originHeight,
    valueFontSize,
  });
  top += originHeight + 8;

  const destinationHeight = measureField(shipment.destination, contentWidth, valueFontSize);
  drawField(commands, {
    label: "Destino",
    value: shipment.destination,
    x: contentX,
    top,
    width: contentWidth,
    height: destinationHeight,
    valueFontSize,
  });
  top += destinationHeight + 8;

  const zipHeight = measureField(shipment.zip, columnWidth, valueFontSize);
  const assignedUserValue = shipment.assignedUserName || shipment.assignedUserId || "No registrado";
  const assignedHeight = measureField(assignedUserValue, columnWidth, valueFontSize);
  const secondRowHeight = Math.max(zipHeight, assignedHeight);
  drawField(commands, {
    label: "Código postal",
    value: shipment.zip,
    x: contentX,
    top,
    width: columnWidth,
    height: secondRowHeight,
    valueFontSize,
  });
  drawField(commands, {
    label: "Usuario asignado",
    value: assignedUserValue,
    x: contentX + columnWidth + columnGap,
    top,
    width: columnWidth,
    height: secondRowHeight,
    valueFontSize,
  });
  top += secondRowHeight + 8;

  const referencesHeight = measureField(shipment.references, contentWidth, valueFontSize);
  drawField(commands, {
    label: "Referencias del domicilio",
    value: shipment.references,
    x: contentX,
    top,
    width: contentWidth,
    height: referencesHeight,
    valueFontSize,
  });
  top += referencesHeight + 8;

  if (shipment.productId) {
    const productHeight = measureField(shipment.productId, contentWidth, valueFontSize);
    drawField(commands, {
      label: "ID del producto asociado",
      value: shipment.productId,
      x: contentX,
      top,
      width: contentWidth,
      height: productHeight,
      valueFontSize,
    });
    top += productHeight;
  }

  return { commands, finalTop: top };
}

function assemblePdf(contentBuffer) {
  const objects = [
    null,
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /ProcSet [/PDF /Text] /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "ascii"
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "ascii"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "ascii"),
    contentBuffer,
  ];

  const parts = [];
  const offsets = new Array(objects.length).fill(0);
  let byteLength = 0;
  const push = (buffer) => {
    parts.push(buffer);
    byteLength += buffer.length;
  };

  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"));

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    offsets[objectNumber] = byteLength;
    push(Buffer.from(`${objectNumber} 0 obj\n`, "ascii"));
    if (objectNumber === 6) {
      push(Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, "ascii"));
      push(contentBuffer);
      push(Buffer.from("\nendstream\nendobj\n", "ascii"));
    } else {
      push(objects[objectNumber]);
      push(Buffer.from("\nendobj\n", "ascii"));
    }
  }

  const xrefOffset = byteLength;
  push(Buffer.from(`xref\n0 ${objects.length}\n`, "ascii"));
  push(Buffer.from("0000000000 65535 f \n", "ascii"));
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    push(Buffer.from(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`, "ascii"));
  }
  push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "ascii"
    )
  );

  return Buffer.concat(parts);
}

function buildShipmentLabelPdf(rawShipment = {}) {
  const shipment = normalizeShipment(rawShipment);
  validateShipment(shipment);

  let layout = layoutLabel(shipment, 10);
  if (layout.finalTop > 752) layout = layoutLabel(shipment, 8.5);
  if (layout.finalTop > 756) layout = layoutLabel(shipment, 7.5);

  const contentBuffer = Buffer.from(`${layout.commands.join("\n")}\n`, "latin1");
  return assemblePdf(contentBuffer);
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", error: "Método no permitido." });
  }

  let stage = "validacion";
  let authSource = "sin-resolver";
  let senderMasked = "correo-no-disponible";
  let recipientMasked = "correo-no-disponible";

  try {
    const contentLength = Number(req.headers?.["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return res.status(413).json({ success: false, code: "PAYLOAD_TOO_LARGE", error: "La información de la etiqueta supera el tamaño permitido." });
    }

    const body = parseBody(req);
    const shipment = normalizeShipment(body.shipment || {});
    const recipientEmail = clean(body.recipientEmail || body.creator?.email || shipment.createdByEmail).toLowerCase();
    const mailSettings = body.mailSettings || {};
    const resolvedMailSettings = resolveMailSettings(mailSettings);
    const senderEmail = resolvedMailSettings.senderEmail;
    const appPassword = resolvedMailSettings.appPassword;
    authSource = resolvedMailSettings.authSource;
    senderMasked = maskEmail(senderEmail);
    recipientMasked = maskEmail(recipientEmail);

    validateShipment(shipment);
    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({
        success: false,
        stage,
        code: "LABEL_RECIPIENT_INVALID",
        error: "El correo del usuario que creó la guía no es válido.",
      });
    }
    if (!senderEmail || !appPassword) {
      return res.status(400).json({
        success: false,
        stage,
        code: "MAIL_SETTINGS_MISSING",
        authSource,
        error: "Falta configurar el correo remitente o la contraseña de aplicación Gmail.",
      });
    }
    if (!isValidEmail(senderEmail)) {
      return res.status(400).json({
        success: false,
        stage,
        code: "MAIL_SENDER_INVALID",
        error: "El correo remitente configurado no es válido.",
      });
    }

    stage = "generar-pdf";
    const pdfBuffer = buildShipmentLabelPdf({
      ...shipment,
      createdByEmail: recipientEmail,
    });

    stage = "enviar-etiqueta";
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });

    const info = await transporter.sendMail({
      from: `"DriveMX Paqueteria" <${senderEmail}>`,
      to: recipientEmail,
      subject: `Etiqueta DriveMX Paqueteria - Guía ${shipment.guideCode}`,
      text: `Se adjunta la etiqueta tamaño carta correspondiente a la guía ${shipment.guideCode}.`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
          <h2>Etiqueta DriveMX Paqueteria</h2>
          <p>Se adjunta la etiqueta tamaño carta correspondiente a la guía <b>${escapeHtml(shipment.guideCode)}</b>.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Etiqueta-DriveMX-${shipment.guideCode}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
          contentDisposition: "attachment",
        },
      ],
    });

    return res.status(200).json({
      success: true,
      stage: "completado",
      guideCode: shipment.guideCode,
      recipient: recipientMasked,
      messageId: clean(info?.messageId),
      pdfBytes: pdfBuffer.length,
    });
  } catch (error) {
    const details = mailErrorDetails(error);
    const authenticationRejected =
      details.code === "EAUTH" ||
      Number(details.responseCode) === 535 ||
      /535(?:-|\s)|username and password not accepted|invalid login/i.test(
        `${details.response} ${details.message}`
      );
    const status = Number(error?.status) || (authenticationRejected ? 401 : 500);
    const code = authenticationRejected
      ? "GMAIL_AUTH_REJECTED"
      : error?.code || details.code || "LABEL_EMAIL_ERROR";
    const message = authenticationRejected
      ? `Google rechazó la autenticación SMTP del remitente ${senderMasked}. Verifica el correo y la contraseña de aplicación configurados desde ${authSource}.`
      : details.message || "No se pudo generar o enviar la etiqueta PDF.";

    console.error("[send-shipment-label] Error.", {
      stage,
      code,
      authSource,
      sender: senderMasked,
      recipient: recipientMasked,
      ...details,
    }, error);

    return res.status(status).json({
      success: false,
      stage,
      code,
      error: message,
    });
  }
}

module.exports = handler;
module.exports.buildShipmentLabelPdf = buildShipmentLabelPdf;
module.exports.normalizeShipment = normalizeShipment;
