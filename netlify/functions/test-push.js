const webpush = require('web-push');
const { supabase, verifyBearerToken, json } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const user = await verifyBearerToken(event);
  if (!user) return json(401, { error: 'Unauthorized. Please log in.' });
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || '';
  if (!publicKey || !privateKey || !subject) return json(500, { error: 'VAPID environment variables are not configured.' });
  try {
    const rows = await supabase(`/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=endpoint,subscription`);
    if (!rows?.length) return json(404, { error: 'No push subscription found. In Customer App, click Enable Notifications and allow notifications.' });
    webpush.setVapidDetails(subject, publicKey, privateKey);
    let sent = 0;
    for (const row of rows) {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify({
          title: 'Sahodara Pharmacy',
          body: 'Test notification received successfully.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: {}
        }));
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, { method: 'DELETE' }).catch(()=>{});
        }
      }
    }
    if (!sent) return json(502, { error: 'Push delivery failed for the saved subscription.' });
    return json(200, { ok: true, message: 'Test notification sent successfully.' });
  } catch (e) {
    return json(500, { error: e.message || 'Test notification failed.' });
  }
};
