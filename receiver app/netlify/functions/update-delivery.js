const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body){
  return { statusCode, headers: {"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS"}, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return json(204, {});
  if(event.httpMethod !== 'POST') return json(405,{error:'Method not allowed'});
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500,{error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.'});
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400,{error:'Invalid JSON'}); }
  const id = String(payload.id || '').trim();
  const deliveryStatus = String(payload.delivery_status || '').trim();
  const deliveryPerson = String(payload.delivery_person || '').trim();
  if(!id || !deliveryStatus || !deliveryPerson) return json(400,{error:'id, delivery_status and delivery_person are required.'});
  const allowed = ['Assigned','Picked Up','Out for Delivery','Delivered'];
  if(!allowed.includes(deliveryStatus)) return json(400,{error:'Invalid delivery status.'});

  const now = new Date().toISOString();
  const patch = { delivery_status: deliveryStatus, delivery_person: deliveryPerson };
  if(deliveryStatus==='Assigned') patch.delivery_assigned_at = now;
  if(deliveryStatus==='Picked Up') patch.delivery_picked_up_at = now;
  if(deliveryStatus==='Out for Delivery'){ patch.delivery_out_at = now; patch.status = 'Out for Delivery'; }
  if(deliveryStatus==='Delivered'){ patch.delivery_delivered_at = now; patch.status = 'Delivered'; }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/customer_orders?id=eq.${encodeURIComponent(id)}`, {
    method:'PATCH',
    headers:{'apikey':SUPABASE_SERVICE_ROLE_KEY,'Authorization':`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(patch)
  });
  const text = await r.text();
  if(!r.ok) return json(r.status,{error:text});
  let rows=[]; try{ rows=text?JSON.parse(text):[]; }catch{}
  if(!rows.length) return json(404,{error:'Order not found.'});
  return json(200,{ok:true,order:rows[0]});
};
