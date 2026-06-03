const twilio = require('twilio');

const STATUS_MESSAGES = {
  Recolectado: '📦 Su paquete ha sido recolectado y está ingresando al proceso logístico.',
  Procesando: '📦 Su paquete se encuentra en proceso de clasificación y preparación para envío.',
  'En Camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  'En camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  Entregado: '✅ Su paquete ha sido entregado correctamente.'
};

function normalizePhone(phone) {
  return String(phone || '').replace(/[\s()-]/g, '').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { guiaId, telefonoCliente, estadoAnterior, estadoNuevo } = req.body || {};

    if (!guiaId || !telefonoCliente || !estadoNuevo) {
      return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
    }

    if (estadoAnterior === estadoNuevo) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'El estado no cambió' });
    }

    const body = STATUS_MESSAGES[estadoNuevo];
    if (!body) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Estado sin SMS configurado' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
      console.error('Twilio SMS config error:', { guiaId, estadoNuevo, hasAccountSid: !!accountSid, hasAuthToken: !!authToken, hasSender: !!fromNumber || !!messagingServiceSid });
      return res.status(500).json({ ok: false, error: 'Configuración de Twilio incompleta' });
    }

    const client = twilio(accountSid, authToken);
    const messagePayload = {
      to: normalizePhone(telefonoCliente),
      body
    };

    if (messagingServiceSid) {
      messagePayload.messagingServiceSid = messagingServiceSid;
    } else {
      messagePayload.from = fromNumber;
    }

    const message = await client.messages.create(messagePayload);

    return res.status(200).json({ ok: true, sid: message.sid });
  } catch (error) {
    console.error('Twilio SMS send error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });

    return res.status(500).json({ ok: false, error: 'No se pudo enviar el SMS' });
  }
};
