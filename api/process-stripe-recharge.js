const admin = require('firebase-admin');
const stripe = require('stripe');

if (!admin.apps.length) {
  admin.initializeApp();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { amount, userId } = req.body;

    const db = admin.firestore();
    // Cambia el appId si tu estructura de Firebase Functions es distinta
    const settingsDoc = await db.collection('artifacts')
      .doc('1:486434579543:web:8fe53f54b1446644236f12') 
      .collection('public')
      .doc('data')
      .collection('wallet_settings')
      .doc('config')
      .get();

    if (!settingsDoc.exists || !settingsDoc.data().stripeSecretKey) {
      throw new Error('La Clave Secreta de Stripe no está configurada.');
    }

    const stripeClient = stripe(settingsDoc.data().stripeSecretKey);

    // Creamos la sesión de Checkout
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Recarga de Saldo - Drive MX',
          },
          unit_amount: Math.round(amount * 100), // En centavos
        },
        quantity: 1,
      }],
      mode: 'payment',
      // Redirecciones cuando el pago termina (Ajusta la URL a la de tu proyecto real)
      success_url: `${req.headers.origin}?pago=exitoso&session_id={CHECKOUT_SESSION_ID}&userId=${userId}`,
      cancel_url: `${req.headers.origin}?pago=cancelado`,
    });

    res.status(200).json({ success: true, sessionId: session.id });
  } catch (error) {
    console.error('Error procesando Stripe:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};