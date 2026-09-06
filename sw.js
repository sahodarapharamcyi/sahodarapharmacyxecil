const CACHE='sahodara-customer-v2';
const ASSETS=['./','./index.html','./style.css','./script.js','./sahodara-logo.jpeg','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>r)));});
self.addEventListener('push',e=>{
  let data={};
  try{data=e.data?e.data.json():{}}catch(_){data={body:e.data?.text()||''};}
  const title=data.title||'Sahodara Pharmacy';
  const options={body:data.body||'',icon:data.icon||'/icon-192.png',badge:data.badge||'/icon-192.png',data:data.data||{},tag:data.tag||'sahodara'};
  e.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const product=e.notification.data?.product;
  const url=product?`/?product=${encodeURIComponent(product)}`:'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){c.navigate(url);return c.focus();}}
    return clients.openWindow(url);
  }));
});
