const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    return { statusCode: 400, body: `Webhook error: ${e.message}` };
  }

  const session = stripeEvent.data.object;

  // ── Pago completado ──────────────────────────────────────
  if (stripeEvent.type === 'checkout.session.completed') {
    const { cursoId, userId, tipo } = session.metadata || {};

    if (userId && cursoId) {
      // Conceder acceso en accesos_curso (sirve para cursos, series e itinerarios)
      await sb.from('accesos_curso').upsert({
        user_id: userId,
        curso_id: cursoId,
        pagado: true,
      }, { onConflict: 'user_id,curso_id' });

      // Actualizar suscripción si existe
      await sb.from('suscripciones').update({
        estado: 'activo',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription || null,
        fecha_inicio: new Date().toISOString(),
      }).eq('stripe_session_id', session.id);
    }
  }

  // ── Suscripción cancelada (pago mensual) ─────────────────
  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subId = session.id;
    const { data: sub } = await sb
      .from('suscripciones')
      .select('user_id, curso_id')
      .eq('stripe_subscription_id', subId)
      .single();

    if (sub) {
      await sb.from('accesos_curso').delete()
        .eq('user_id', sub.user_id)
        .eq('curso_id', sub.curso_id);

      await sb.from('suscripciones')
        .update({ estado: 'cancelado' })
        .eq('stripe_subscription_id', subId);
    }
  }

  // ── Pago fallido (suscripción mensual) ───────────────────
  if (stripeEvent.type === 'invoice.payment_failed') {
    const customerId = session.customer;
    const { data: sub } = await sb
      .from('suscripciones')
      .select('user_id, curso_id')
      .eq('stripe_customer_id', customerId)
      .eq('estado', 'activo')
      .single();

    if (sub) {
      await sb.from('suscripciones')
        .update({ estado: 'pago_fallido' })
        .eq('stripe_customer_id', customerId);
      // No revocar acceso inmediatamente — Stripe reintentará 3 veces
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
