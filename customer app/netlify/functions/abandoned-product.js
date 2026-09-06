const { supabase, verifyBearerToken, json } = require('./_supabase');
exports.handler = async (event) => {
  if (!['POST','DELETE'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });
  const user = await verifyBearerToken(event);
  if (!user) return json(401, { error: 'Unauthorized' });
  try {
    if (event.httpMethod === 'DELETE') {
      await supabase(`/rest/v1/abandoned_product_reminders?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      return json(200, { ok: true });
    }
    const body = JSON.parse(event.body || '{}');
    const p = body.product;
    if (!p?.id || !p?.name) return json(400, { error: 'Product is required.' });
    const scheduledAt = new Date(Date.now() + 30000).toISOString();
    await supabase('/rest/v1/abandoned_product_reminders', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: user.id, product_id: String(p.id), product_name: String(p.name), price: Number(p.price || 0), mrp: Number(p.mrp || 0), scheduled_at: scheduledAt, sent_at: null })
    });
    return json(200, { ok: true, scheduled_at: scheduledAt });
  } catch (e) { return json(500, { error: e.message }); }
};
