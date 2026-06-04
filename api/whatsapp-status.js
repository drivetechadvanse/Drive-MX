const STATUS_MESSAGES = {
  'Recolectado': '📦 Su paquete ha sido recolectado y está ingresando al proceso logístico.',
  'Procesando': '📦 Su paquete se encuentra en proceso de clasificación y preparación para envío.',
  'En Camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  'En camino': '🚚 Su paquete se encuentra en camino hacia su destino.',
  'Entregado': '✅ Su paquete ha sido entregado correctamente.'
};

function normalizeWhatsAppPhone(phone) {
  let value = String(phone || '').trim().replace(/[^\d+]/g, '');

  if (value.startsWith('+')) value = value.slice(1);
  if (value.startsWith('00')) value = value.slice(2);

  // México: si capturan 10 dígitos, convertir a formato internacional WhatsApp sin +.
  if (/^\d{10}$/.test(value)) return `52${value}`;

  // Si ya viene con código país 52 + 10 dígitos, dejarlo igual.
  if (/^52\d{10}$/.test(value)) return value;

  return value;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: req.url,
      message: 'API WhatsApp activa. Usa POST para enviar notificaciones.',
      requiredEnv: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { guiaId, telefonoCliente, estadoAnterior, estadoNuevo } = req.body || {};

    if (!guiaId || !telefonoCliente || !estadoNuevo) {
      console.error('WhatsApp missing fields:', { guiaId, hasTelefonoCliente: !!telefonoCliente, estadoNuevo });
      return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
    }

    if (estadoAnterior === estadoNuevo) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'El estado no cambió' });
    }

    const body = STATUS_MESSAGES[estadoNuevo];
    if (!body) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Estado sin WhatsApp configurado', estadoNuevo });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.error('WhatsApp config error:', {
        guiaId,
        estadoNuevo,
        hasToken: !!token,
        hasPhoneNumberId: !!phoneNumberId
      });
      return res.status(500).json({ ok: false, error: 'Configuración de WhatsApp incompleta en Vercel' });
    }

    const to = normalizeWhatsAppPhone(telefonoCliente);

    if (!/^\d{10,15}$/.test(to)) {
      console.error('WhatsApp invalid phone:', { guiaId, telefonoCliente, normalized: to });
      return res.status(400).json({
        ok: false,
        error: 'Número inválido. Usa 10 dígitos de México o formato internacional 52XXXXXXXXXX.'
      });
    }

    const url = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`;

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'estado_guia';
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'es_MX';

    // IMPORTANTE: Para notificaciones automáticas de estatus usamos plantilla.
    // La plantilla debe tener 2 variables en el BODY:
    // {{1}} = número de guía
    // {{2}} = nuevo estatus
    const whatsappPayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: String(guiaId) },
              { type: 'text', text: String(estadoNuevo) }
            ]
          }
        ]
      }
    };

    console.log('WhatsApp request:', {
      guiaId,
      estadoAnterior,
      estadoNuevo,
      to,
      phoneNumberId,
      templateName,
      templateLang
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(whatsappPayload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('WhatsApp send error:', {
        guiaId,
        estadoAnterior,
        estadoNuevo,
        to,
        status: response.status,
        error: data.error || data
      });

      return res.status(response.status).json({
        ok: false,
        error: 'No se pudo enviar el WhatsApp',
        detail: data.error?.message || JSON.stringify(data),
        code: data.error?.code || null
      });
    }

    console.log('WhatsApp sent:', {
      guiaId,
      estadoAnterior,
      estadoNuevo,
      to,
      messageId: data.messages?.[0]?.id || null
    });

    return res.status(200).json({ ok: true, to, messageId: data.messages?.[0]?.id || null });
  } catch (error) {
    console.error('WhatsApp unexpected error:', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      ok: false,
      error: 'No se pudo enviar el WhatsApp',
      detail: error.message
    });
  }
};

