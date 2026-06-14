const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    return {statusCode:400, body:`Webhook error: ${e.message}`};
  }

  const session = stripeEvent.data.object;

  if(stripeEvent.type === 'checkout.session.completed') {
    const { cursoId, userId } = session.metadata;
    // Grant access
    await sb.from('accesos_curso').upsert({
      user_id: userId, curso_id: cursoId, pagado: true,
    }, {onConflict: 'user_id,curso_id'});
    // Update subscription status
    await sb.from('suscripciones').update({
      estado: 'activo',
      stripe_session_id: session.id,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription || null,
      fecha_inicio: new Date().toISOString(),
    }).eq('stripe_session_id', session.id);
  }

  if(stripeEvent.type === 'customer.subscription.deleted') {
    // Revoke access on cancellation
    const subId = session.id;
    const { data: sub } = await sb.from('suscripciones')
      .select('user_id, curso_id')
      .eq('stripe_subscription_id', subId)
      .single();
    if(sub) {
      await sb.from('accesos_curso').delete()
        .eq('user_id', sub.user_id).eq('curso_id', sub.curso_id);
      await sb.from('suscripciones').update({estado: 'cancelado'})
        .eq('stripe_subscription_id', subId);
    }
  }

  return {statusCode:200, body: JSON.stringify({received: true})};
};
