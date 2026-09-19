exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' };
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode:400, headers, body:JSON.stringify({error:'Order id is required.'}) };
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return { statusCode:500, headers, body:JSON.stringify({error:'Server storage credentials are not configured.'}) };
    const r = await fetch(`${supabaseUrl}/rest/v1/customer_orders?id=eq.${encodeURIComponent(id)}&select=prescription_path&limit=1`, { headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, Accept:'application/json' } });
    if(!r.ok) return { statusCode:500, headers, body:JSON.stringify({error:'Could not read order.'}) };
    const rows=await r.json(); const path=rows?.[0]?.prescription_path;
    if(!path) return { statusCode:404, headers, body:JSON.stringify({error:'No prescription uploaded for this order.'}) };
    const sr = await fetch(`${supabaseUrl}/storage/v1/object/sign/prescriptions/${path}`, { method:'POST', headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({expiresIn:600}) });
    const data=await sr.json();
    if(!sr.ok || !data.signedURL) return { statusCode:500, headers, body:JSON.stringify({error:data?.message||'Could not create secure prescription link.'}) };
    const base = supabaseUrl.replace(/\/$/,'');
    const url = data.signedURL.startsWith('http') ? data.signedURL : base + data.signedURL;
    return { statusCode:200, headers, body:JSON.stringify({url}) };
  } catch(e) { return { statusCode:500, headers, body:JSON.stringify({error:e.message||'Unexpected error.'}) } }
};
