const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return {statusCode:405, body:'Method not allowed'};
  try {
    const { cursoId, userId, userEmail, tipo } = JSON.parse(event.body);
    const { data: curso } = await sb.from('cursos').select('*').eq('id', cursoId).single();
    if(!curso) return {statusCode:404, body: JSON.stringify({error:'Curso no encontrado'})};

    const esMensual = tipo === 'mensual' || curso.tipo_pago === 'mensual';
    const precioEnCentimos = Math.round((curso.precio || 5) * 100);
    const APP_URL = process.env.APP_URL || 'https://mater-mundi.netlify.app';

    const sessionParams = {
      payment_method_types: ['card'],
      customer_email: userEmail,
      metadata: { cursoId, userId },
      success_url: `${APP_URL}?pago=ok&curso=${cursoId}`,
      cancel_url: `${APP_URL}?pago=cancelado`,
    };

    if(esMensual) {
      const price = await stripe.prices.create({
        currency: 'eur',
        unit_amount: precioEnCentimos,
        recurring: { interval: 'month' },
        product_data: { name: curso.nombre },
      });
      sessionParams.mode = 'subscription';
      sessionParams.line_items = [{price: price.id, quantity: 1}];
    } else {
      sessionParams.mode = 'payment';
      sessionParams.line_items = [{
        price_data: {
          currency: 'eur',
          unit_amount: precioEnCentimos,
          product_data: { name: curso.nombre, description: curso.descripcion || '' },
        },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    await sb.from('suscripciones').insert({
      user_id: userId, curso_id: cursoId,
      stripe_session_id: session.id,
      tipo: esMensual ? 'mensual' : 'unico',
      estado: 'pendiente', precio: curso.precio,
    });

    return {statusCode:200, body: JSON.stringify({url: session.url})};
  } catch(e) {
    return {statusCode:500, body: JSON.stringify({error: e.message})};
  }
};
