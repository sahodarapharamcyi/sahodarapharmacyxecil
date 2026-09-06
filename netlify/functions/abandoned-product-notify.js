const webpush = require('web-push');
const { supabase } = require('./_supabase');
function off(r){ const mrp=Number(r.mrp||0), price=Number(r.price||0); return mrp>0?Math.max(0,Math.min(95,Math.round((mrp-price)/mrp*100))):0; }
async function inApp(userId,title,message){ try{await supabase('/rest/v1/customer_notifications',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:userId,title,message})})}catch(_){}}
exports.handler=async()=>{
 const pub=process.env.VAPID_PUBLIC_KEY||'',priv=process.env.VAPID_PRIVATE_KEY||'',subject=process.env.VAPID_SUBJECT||'mailto:admin@example.com';
 if(!pub||!priv)return{statusCode:503,body:'VAPID keys are not configured'};
 webpush.setVapidDetails(subject,pub,priv);
 const due=await supabase('/rest/v1/abandoned_product_reminders?sent_at=is.null&scheduled_at=lte.'+encodeURIComponent(new Date().toISOString())+'&select=*');
 let sent=0;
 for(const r of due||[]){
  try{
   const subs=await supabase(`/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(r.user_id)}&select=id,subscription`);
   const message=`You left ${r.product_name} in your basket. MRP ₹${Number(r.mrp||r.price||0).toFixed(2)} • Selling ₹${Number(r.price||0).toFixed(2)} • ${off(r)}% OFF`;
   for(const sub of subs||[]){try{await webpush.sendNotification(sub.subscription,JSON.stringify({title:'Sahodara Pharmacy — Basket Reminder',body:message,icon:'/icon-192.png',badge:'/icon-192.png',data:{product:String(r.product_id)}}));}catch(e){if([404,410].includes(e.statusCode||e.status))await supabase(`/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(sub.id)}`,{method:'DELETE'}).catch(()=>{});}}
   await inApp(r.user_id,'Basket Reminder',message);
   await supabase(`/rest/v1/abandoned_product_reminders?user_id=eq.${encodeURIComponent(r.user_id)}`,{method:'DELETE'});
   sent++;
  }catch(_){ }
 }
 return{statusCode:200,body:`Sent ${sent} basket reminders.`};
};
