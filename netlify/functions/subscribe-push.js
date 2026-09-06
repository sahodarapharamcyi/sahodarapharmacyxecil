const { supabase, verifyBearerToken, json } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const user = await verifyBearerToken(event);
  if (!user) return json(401, { error: 'Unauthorized' });
  try {
    const body = JSON.parse(event.body || '{}');
    const subscription = body.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json(400, { error: 'Invalid push subscription.' });
    await supabase('/rest/v1/push_subscriptions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: user.id, endpoint: subscription.endpoint, subscription })
    });
    return json(200, { ok: true });
  } catch (e) { return json(500, { error: e.message }); }
};
