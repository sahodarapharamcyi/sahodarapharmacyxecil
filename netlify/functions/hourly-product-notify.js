const webpush = require('web-push');
const { supabase } = require('./_supabase');
function off(p){ const mrp=Number(p.mrp||0), price=Number(p.price||0); return mrp>0?Math.max(0,Math.min(95,Math.round((mrp-price)/mrp*100))):0; }
async function insertInAppNotification(userId,title,message){
 try{ await supabase('/rest/v1/customer_notifications',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:userId,title,message})}); }catch(_){ }
}
exports.handler = async () => {
 const pub=process.env.VAPID_PUBLIC_KEY||'', priv=process.env.VAPID_PRIVATE_KEY||'', subject=process.env.VAPID_SUBJECT||'mailto:admin@example.com';
 if(!pub||!priv) return {statusCode:503,body:'VAPID keys are not configured'};
 webpush.setVapidDetails(subject,pub,priv);
 const products=await supabase('/rest/v1/products?select=id,name,price,mrp&order=name.asc');
 const sorted=(products||[]).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
 if(!sorted.length) return {statusCode:200,body:'No products'};
 const subs=await supabase('/rest/v1/push_subscriptions?select=id,user_id,endpoint,subscription');
 let sent=0;
 for(const row of subs||[]){
   try{
     const states=await supabase(`/rest/v1/product_notification_state?user_id=eq.${encodeURIComponent(row.user_id)}&select=user_id,next_index`);
     const state=states?.[0]||{next_index:0};
     const idx=Math.max(0,Math.min(sorted.length-1,Number(state.next_index||0)));
     const p=sorted[idx];
     const message=`${p.name} • MRP ₹${Number(p.mrp||p.price||0).toFixed(2)} • Selling ₹${Number(p.price||0).toFixed(2)} • ${off(p)}% OFF`;
     await webpush.sendNotification(row.subscription,JSON.stringify({title:'Sahodara Pharmacy',body:message,icon:'/icon-192.png',badge:'/icon-192.png',data:{product:String(p.id)}}));
     await insertInAppNotification(row.user_id,'Product Update',message);
     await supabase('/rest/v1/product_notification_state',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:row.user_id,next_index:(idx+1)%sorted.length,updated_at:new Date().toISOString()})});
     sent++;
   }catch(e){
     if([404,410].includes(e.statusCode||e.status)){
       await supabase(`/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE'}).catch(()=>{});
     }
   }
 }
 return {statusCode:200,body:`Sent ${sent} hourly product notifications.`};
};
