const twilio = require('twilio');

const STATUS_MESSAGES = {
  'Recolectado': '📦 Su paquete ha sido recolectado y está ingresando al proceso logístico.',
  'Procesando': '📦 Su paquete se encuentra en proceso de clasificación y preparación para envío.',
  'En Camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  'En camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  'Entregado': '✅ Su paquete ha sido entregado correctamente.'
};

function normalizePhone(phone) {
  let value = String(phone || '').trim();

  // Quita espacios, guiones y paréntesis, pero conserva + si ya lo trae.
  value = value.replace(/[^\d+]/g, '');

  // México: si capturan 10 dígitos, convertir a formato internacional.
  if (/^\d{10}$/.test(value)) {
    return `+52${value}`;
  }

  // México: si capturan 52 + 10 dígitos sin "+"
  if (/^52\d{10}$/.test(value)) {
    return `+${value}`;
  }

  // Si trae 00 internacional, convertir a +
  if (/^00\d{10,15}$/.test(value)) {
    return `+${value.slice(2)}`;
  }

  return value;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: req.url,
      message: 'API Twilio activa. Usa POST para enviar SMS.',
      requiredEnv: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER o TWILIO_FROM_NUMBER']
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { guiaId, telefonoCliente, estadoAnterior, estadoNuevo } = req.body || {};

    if (!guiaId || !telefonoCliente || !estadoNuevo) {
      console.error('Twilio SMS missing fields:', { guiaId, hasTelefonoCliente: !!telefonoCliente, estadoNuevo });
      return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
    }

    if (estadoAnterior === estadoNuevo) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'El estado no cambió' });
    }

    const body = STATUS_MESSAGES[estadoNuevo];
    if (!body) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Estado sin SMS configurado', estadoNuevo });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
      console.error('Twilio SMS config error:', {
        guiaId,
        estadoNuevo,
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasSender: !!fromNumber || !!messagingServiceSid
      });
      return res.status(500).json({ ok: false, error: 'Configuración de Twilio incompleta en Vercel' });
    }

    const to = normalizePhone(telefonoCliente);

    if (!/^\+\d{10,15}$/.test(to)) {
      console.error('Twilio SMS invalid phone:', { guiaId, telefonoCliente, normalized: to });
      return res.status(400).json({
        ok: false,
        error: 'Número inválido. Usa 10 dígitos de México o formato internacional +52XXXXXXXXXX.'
      });
    }

    const client = twilio(accountSid, authToken);
    const messagePayload = { to, body };

    if (messagingServiceSid) {
      messagePayload.messagingServiceSid = messagingServiceSid;
    } else {
      messagePayload.from = fromNumber;
    }

    const message = await client.messages.create(messagePayload);

    console.log('Twilio SMS sent:', {
      guiaId,
      estadoAnterior,
      estadoNuevo,
      to,
      sid: message.sid,
      status: message.status
    });

    return res.status(200).json({ ok: true, sid: message.sid, to });
  } catch (error) {
    console.error('Twilio SMS send error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });

    return res.status(500).json({
      ok: false,
      error: 'No se pudo enviar el SMS',
      detail: error.message,
      code: error.code || null
    });
  }
};
