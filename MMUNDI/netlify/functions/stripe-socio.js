const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Importes predefinidos para hacerse socio (en euros)
const IMPORTES_VALIDOS = [3, 5, 10, 20, 50];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { importe, userId, userEmail, nombre } = JSON.parse(event.body);

    const importeNum = parseFloat(importe);
    if (!IMPORTES_VALIDOS.includes(importeNum)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Importe no válido' }) };
    }

    const precioEnCentimos = Math.round(importeNum * 100);
    const APP_URL = process.env.APP_URL || 'https://mater-mundi.netlify.app';

    const price = await stripe.prices.create({
      currency: 'eur',
      unit_amount: precioEnCentimos,
      recurring: { interval: 'month' },
      product_data: { name: 'Socio Mater Mundi TV — ' + importeNum + '€/mes' },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: userEmail,
      metadata: { tipo: 'socio_mensual', userId: userId || '', nombre: nombre || '' },
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${APP_URL}?socio=ok`,
      cancel_url: `${APP_URL}?socio=cancelado`,
    });

    // Guardar registro de intención (se confirma vía webhook)
    if (userId) {
      await sb.from('suscripciones').insert({
        user_id: userId,
        curso_id: 'socio_mensual',
        stripe_session_id: session.id,
        tipo: 'mensual',
        estado: 'pendiente',
        precio: importeNum,
      });
    }

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
