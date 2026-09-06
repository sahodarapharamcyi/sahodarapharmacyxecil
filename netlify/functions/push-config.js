const { json } = require('./_supabase');
exports.handler = async () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  return json(publicKey ? 200 : 503, publicKey ? { publicKey } : { error: 'VAPID public key is not configured.' });
};
