const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const PRECIO_VELA_PERPETUA = 15; // € — pago único

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { intencion, nombre, userId, userEmail } = JSON.parse(event.body);

    if (!intencion || !intencion.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La intención es obligatoria' }) };
    }

    const APP_URL = process.env.APP_URL || 'https://mater-mundi.netlify.app';
    const precioEnCentimos = PRECIO_VELA_PERPETUA * 100;

    // Crear la vela en estado pendiente de pago
    const { data: vela, error: velaError } = await sb.from('velas').insert({
      intencion: intencion.trim(),
      nombre: nombre || 'Anónimo',
      user_id: userId || null,
      tipo: 'perpetua',
      pagado: false,
      precio: PRECIO_VELA_PERPETUA,
      activa: false // se activa cuando el webhook confirma el pago
    }).select().single();

    if (velaError) return { statusCode: 500, body: JSON.stringify({ error: velaError.message }) };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'bizum'],
      customer_email: userEmail,
      metadata: { tipo: 'vela_perpetua', velaId: vela.id },
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: precioEnCentimos,
          product_data: {
            name: 'Vela Perpetua — Mater Mundi',
            description: 'Intención mantenida de forma permanente y destacada'
          },
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}?vela=ok`,
      cancel_url: `${APP_URL}?vela=cancelado`,
    });

    await sb.from('velas').update({ stripe_session_id: session.id }).eq('id', vela.id);

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
