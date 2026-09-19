const SUPABASE_URL='https://coweieefkktidapxipdb.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_V5Po3mfFyMxn2alJswzSrA_D9zE_95D';
const ADMIN_ID='admin';
const ADMIN_PASSWORD='Sai9390';
const ORDERS_ENDPOINT=SUPABASE_URL+'/rest/v1/customer_orders';
const PRODUCTS_ENDPOINT=SUPABASE_URL+'/rest/v1/products';
const STORAGE_BUCKET='product-images';
const STORAGE_ENDPOINT=SUPABASE_URL+'/storage/v1/object';
const SLIDES_ENDPOINT=SUPABASE_URL+'/rest/v1/ad_slides';
const OFFERS_ENDPOINT=SUPABASE_URL+'/rest/v1/customer_offers';
const NOTIFICATIONS_ENDPOINT=SUPABASE_URL+'/rest/v1/customer_notifications';
const DELIVERY_SETTINGS_ENDPOINT=SUPABASE_URL+'/rest/v1/delivery_settings';
const SHOP_LATITUDE=17.4741881;
const SHOP_LONGITUDE=78.5630329;
const DELIVERY_RADIUS_KM=3;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

let products=[];
let loggedIn=false;
let refreshTimer=null;
let lastNewIds=new Set();
let orderFilter='All';


function toggleAdminMenu(){
  const menu=$('adminMenu'), overlay=$('adminMenuOverlay');
  if(!menu||!overlay)return;
  const opening=menu.classList.contains('hidden');
  menu.classList.toggle('hidden',!opening);
  overlay.classList.toggle('hidden',!opening);
  document.body.classList.toggle('menu-open',opening);
}
function closeAdminMenu(e){
  if(e && e.target && e.target.id!=='adminMenuOverlay')return;
  const menu=$('adminMenu'), overlay=$('adminMenuOverlay');
  if(menu)menu.classList.add('hidden');
  if(overlay)overlay.classList.add('hidden');
  document.body.classList.remove('menu-open');
}

function showTab(tab){
  $('ordersPanel').classList.toggle('hidden',tab!=='orders');
  $('productsPanel').classList.toggle('hidden',tab!=='products');
  $('adsPanel').classList.toggle('hidden',tab!=='ads');
  $('ordersTab').classList.toggle('active',tab==='orders');
  $('productsTab').classList.toggle('active',tab==='products');
  $('adsTab').classList.toggle('active',tab==='ads');
  $('offersTab')?.classList.toggle('active',tab==='offers');
  $('dashboardTab')?.classList.toggle('active',tab==='dashboard');
  $('offersPanel')?.classList.toggle('hidden',tab!=='offers');
  $('dashboardPanel')?.classList.toggle('hidden',tab!=='dashboard');
  if(tab==='products') loadProducts();
  if(tab==='ads') loadAdSlides();
  if(tab==='offers') { loadProducts(); loadOffers(); }
  if(tab==='dashboard') renderAnalytics();
}
async function saveShopLocation(){
 try{
  await api(DELIVERY_SETTINGS_ENDPOINT+'?id=eq.shop',{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({shop_latitude:SHOP_LATITUDE,shop_longitude:SHOP_LONGITUDE,delivery_radius_km:DELIVERY_RADIUS_KM,updated_at:new Date().toISOString()})});
  alert('Sahodara Pharmacy shop location saved. Customer delivery is limited to 3 km from the fixed shop location.');
  const e=$('shopLocationStatus'); if(e)e.textContent=`Shop location saved • ${SHOP_LATITUDE.toFixed(7)}, ${SHOP_LONGITUDE.toFixed(7)} • 3 km delivery radius`;
 }catch(e){alert('Could not save shop location. '+e.message)}
}
function loginAdmin(){
  const id=$('adminId').value.trim(), pw=$('adminPassword').value;
  if(id===ADMIN_ID && pw===ADMIN_PASSWORD){
    loggedIn=true;
    $('loginScreen').classList.add('hidden'); $('app').classList.remove('hidden'); $('logoutBtn').classList.remove('hidden');
    loadOrders(); startAutoRefresh();
  }else{
    $('loginError').textContent='Invalid Admin ID or password.'; $('loginError').classList.remove('hidden');
  }
}
function logoutAdmin(){
  loggedIn=false; if(refreshTimer)clearInterval(refreshTimer);
  $('app').classList.add('hidden'); $('logoutBtn').classList.add('hidden'); $('loginScreen').classList.remove('hidden');
}
async function api(url, options={}){
  const headers=Object.assign({'apikey':SUPABASE_ANON_KEY,'Accept':'application/json'},options.headers||{});
  const r=await fetch(url,Object.assign({},options,{headers}));
  const t=await r.text();
  if(!r.ok)throw new Error('Supabase '+r.status+': '+t);
  return t?JSON.parse(t):null;
}

function deliveryDrafts(){
  try{return JSON.parse(localStorage.getItem('sahodara_delivery_drafts')||'{}')||{};}catch(_){return {};}}
function saveDeliveryDraft(id, data){
  try{const all=deliveryDrafts(); all[String(id)]={...(all[String(id)]||{}),...data,updated_at:Date.now()}; localStorage.setItem('sahodara_delivery_drafts',JSON.stringify(all));}catch(_){}
}
function getDeliveryDraft(id){return deliveryDrafts()[String(id)]||{};}

async function loadOrders(){
  if(!loggedIn)return;
  const err=$('orderError');err.classList.add('hidden');
  try{
    let rows=await api(ORDERS_ENDPOINT+'?select=id,customer_name,customer_phone,customer_address,customer_notes,customer_latitude,customer_longitude,items,total,status,created_at,order_user_id,prescription_path,prescription_status,prescription_note,delivery_status,delivery_person,delivery_assigned_at,delivery_picked_up_at,delivery_out_at,delivery_delivered_at&order=created_at.desc');
    rows=(rows||[]).map(o=>{const d=getDeliveryDraft(o.id); const rider=String(o.delivery_person||d.rider_name||'').trim(); const ds=String(o.delivery_status||d.delivery_status||'Unassigned').trim()||'Unassigned'; return {...o, delivery_person:rider||null, delivery_status:ds};});
    const counts={New:0,Accepted:0,Preparing:0,'Out for Delivery':0,Delivered:0};
    rows.forEach(o=>{const s=normalizeStatus(o.status);if(counts[s]!==undefined)counts[s]++;});
    $('allCount').textContent=rows.length;$('newCount').textContent=counts.New;$('acceptedCount').textContent=counts.Accepted;$('preparingCount').textContent=counts.Preparing;$('outCount').textContent=counts['Out for Delivery'];$('deliveredCount').textContent=counts.Delivered;
    updateFilterButtons();
    $('lastUpdated').textContent='Updated '+new Date().toLocaleTimeString();
    const newIds=new Set(rows.filter(o=>normalizeStatus(o.status)==='New').map(o=>o.id));
    if(lastNewIds.size && [...newIds].some(id=>!lastNewIds.has(id))) notifyNewOrder();
    lastNewIds=newIds;
    const q=String($('orderSearch')?.value||'').trim().toLowerCase(); let visible=orderFilter==='All'?rows:rows.filter(o=>normalizeStatus(o.status)===orderFilter); if(q) visible=visible.filter(o=>`${o.id} ${o.customer_name} ${o.customer_phone} ${o.customer_address}`.toLowerCase().includes(q));
    $('orders').innerHTML=visible.length?visible.map(renderOrder).join(''):`<div class="empty">No ${esc(orderFilter.toLowerCase())} orders.</div>`;
  }catch(e){
    console.error(e);$('orderError').textContent='Could not load orders.\n'+e.message;$('orderError').classList.remove('hidden');
  }
}

function setOrderFilter(filter){
  orderFilter=filter;
  updateFilterButtons();
  loadOrders();
}
function updateFilterButtons(){
  ['All','New','Accepted','Preparing','Out','Delivered'].forEach(k=>{
    const id={All:'filterAll',New:'filterNew',Accepted:'filterAccepted',Preparing:'filterPreparing',Out:'filterOut',Delivered:'filterDelivered'}[k];
    const el=$(id);
    if(el)el.classList.toggle('active-filter',orderFilter===({All:'All',New:'New',Accepted:'Accepted',Preparing:'Preparing',Out:'Out for Delivery',Delivered:'Delivered'}[k]));
  });
}
function normalizeStatus(s){
  const x=String(s||'New').toLowerCase().trim();
  if(x==='new')return 'New';
  if(x==='accepted')return 'Accepted';
  if(x==='preparing')return 'Preparing';
  if(x==='out for delivery'||x==='out_for_delivery'||x==='out')return 'Out for Delivery';
  if(x==='delivered')return 'Delivered';
  return 'New';
}
function statusClass(s){return s==='Out for Delivery'?'Out':s.replace(/\s/g,'');}
function nextStatus(s){
  const order=['New','Accepted','Preparing','Out for Delivery','Delivered'];const i=order.indexOf(s);return i>=0&&i<order.length-1?order[i+1]:null;
}
function renderOrder(o){
  const s=normalizeStatus(o.status), nxt=nextStatus(s);
  const items=Array.isArray(o.items)?o.items:[];
  return `<article class="order-card">
    <div class="order-grid">
      <div>
        <div class="label">Order ID</div><h3>${esc(o.id)}</h3>
        <div class="label">Order Time</div><div class="value">${o.created_at?new Date(o.created_at).toLocaleString():''}</div>
        <div style="margin-top:12px"><span class="status ${statusClass(s)}">${esc(s)}</span></div>
      </div>
      <div>
        <div class="label">Customer</div><div class="value"><b>${esc(o.customer_name)}</b></div>
        <div class="label" style="margin-top:10px">Phone</div><div class="value"><a href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a></div>
        <div class="label" style="margin-top:10px">Delivery Address</div><div class="value address">${esc(o.customer_address)}</div>${(o.customer_latitude!=null&&o.customer_longitude!=null)?`<div style="margin-top:8px"><a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(o.customer_latitude)},${encodeURIComponent(o.customer_longitude)}">📍 Open Customer Location</a></div>`:`<div style="margin-top:8px"><a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer_address||'')}">📍 Open Address in Google Maps</a></div>`}
        ${o.customer_notes?`<div class="label" style="margin-top:10px">Notes</div><div class="value address">${esc(o.customer_notes)}</div>`:''}${o.prescription_path?`<div class="label" style="margin-top:10px">Prescription</div><div class="value prescription-admin"><div><b>Status:</b> ${esc(o.prescription_status||'Uploaded')}${o.prescription_note?` — ${esc(o.prescription_note)}`:''}</div><div class="prescription-actions"><button type="button" onclick="viewPrescription('${esc(o.id)}')">📄 View Prescription</button><button type="button" onclick="updatePrescription('${esc(o.id)}','Verified','Prescription verified')">✅ Verify</button><button type="button" onclick="rejectPrescription('${esc(o.id)}')">❌ Reject</button></div></div>`:''}
      </div>
      <div>
        <div class="label">Full Order Details</div><div class="items">${items.length?items.map(i=>`<div class="item"><span>${esc(i.name)} × ${esc(i.quantity)}</span><b>₹${money(i.line_total ?? Number(i.price||0)*Number(i.quantity||0))}</b></div>`).join(''):'No item details saved.'}</div>
        <div class="total">Total: ₹${money(o.total)}</div>
      </div>
      <div>
        <div class="label">Order Actions</div>
        <div class="actions">
          ${nxt?`<button class="next" onclick="changeStatus('${esc(o.id)}','${esc(nxt)}')">${nxt==='Accepted'?'Accept Order':nxt}</button>`:''}
          ${s!=='New'?`<button onclick="changeStatus('${esc(o.id)}','New')">Set New</button>`:''}
          ${s!=='Accepted'?`<button onclick="changeStatus('${esc(o.id)}','Accepted')">Accepted</button>`:''}
          ${s!=='Preparing'?`<button onclick="changeStatus('${esc(o.id)}','Preparing')">Preparing</button>`:''}
          ${s!=='Out for Delivery'?`<button onclick="changeStatus('${esc(o.id)}','Out for Delivery')">Out for Delivery</button>`:''}
          ${s!=='Delivered'?`<button onclick="changeStatus('${esc(o.id)}','Delivered')">Delivered</button>`:''}
        </div>
        <div class="delivery-admin-box" data-delivery-status="${esc(o.delivery_status||'Unassigned')}"><div class="label">Delivery Management</div><input id="driver-${esc(o.id)}" class="driver-input" placeholder="Enter delivery person / rider name" value="${esc(o.delivery_person||getDeliveryDraft(o.id).rider_name||'')}"><div class="delivery-actions"><button type="button" ${o.delivery_status&&o.delivery_status!=='Unassigned'?'disabled':''} onclick="setDelivery('${esc(o.id)}','Assigned')">👤 Assigned</button><button type="button" ${o.delivery_status==='Assigned'?'':'disabled'} onclick="setDelivery('${esc(o.id)}','Picked Up')">📦 Picked Up</button><button type="button" ${o.delivery_status==='Picked Up'?'':'disabled'} onclick="setDelivery('${esc(o.id)}','Out for Delivery')">🚚 Out for Delivery</button><button type="button" ${o.delivery_status==='Out for Delivery'?'':'disabled'} onclick="setDelivery('${esc(o.id)}','Delivered')">✅ Delivered</button></div><div class="delivery-current">Current: <b>${esc(o.delivery_status||'Unassigned')}</b>${o.delivery_person?`<div class="rider-name">Delivery Person: <b>${esc(o.delivery_person)}</b></div>`:''}</div></div>
      </div>
    </div>
  </article>`;
}
async function changeStatus(id,status){
  try{
    await api(ORDERS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{
      method:'PATCH',
      headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({status})
    });
    try{
      const rows=await api(ORDERS_ENDPOINT+'?id=eq.'+encodeURIComponent(id)+'&select=order_user_id,customer_name');
      const userId=rows?.[0]?.order_user_id;
      if(userId){await api(NOTIFICATIONS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({user_id:userId,title:`Order ${status}`,message:`Your order ${id} is now ${status}.`})});}
    }catch(_){ }
    await loadOrders();
  }catch(e){
    alert('Could not update order status.\n\n'+e.message);
  }
}

async function updatePrescription(id,status,note){
  try{
    await api(ORDERS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({prescription_status:status,prescription_note:note||''})});
    await loadOrders();
  }catch(e){alert('Could not update prescription. '+e.message)}
}
async function rejectPrescription(id){
  const reason=prompt('Reason for rejecting prescription / request a new prescription:','Please upload a clearer or valid prescription.');
  if(reason===null)return;
  await updatePrescription(id,'Rejected',reason);
}
async function viewPrescription(id){
  try{
    const res=await fetch('/.netlify/functions/prescription-view?id='+encodeURIComponent(id));
    const data=await res.json();
    if(!res.ok||!data.url)throw new Error(data.error||'Prescription link could not be created.');
    window.open(data.url,'_blank','noopener');
  }catch(e){alert('Could not open prescription. '+e.message)}
}
function applyDeliveryUI(id, deliveryStatus, driver){
  const input=$('driver-'+id);
  const box=input?.closest('.delivery-admin-box');
  if(!box)return;
  box.dataset.deliveryStatus=deliveryStatus;
  if(input && driver) input.value=driver;
  const buttons=[...box.querySelectorAll('.delivery-actions button')];
  const next={
    'Unassigned':'Assigned',
    'Assigned':'Picked Up',
    'Picked Up':'Out for Delivery',
    'Out for Delivery':'Delivered',
    'Delivered':null
  };
  const labels=['Assigned','Picked Up','Out for Delivery','Delivered'];
  buttons.forEach((btn,idx)=>{
    const target=labels[idx];
    btn.disabled = deliveryStatus !== target && target !== next[deliveryStatus];
    if(target===deliveryStatus) btn.classList.add('active-filter'); else btn.classList.remove('active-filter');
  });
  const cur=box.querySelector('.delivery-current');
  if(cur){
    cur.innerHTML=`Current: <b>${esc(deliveryStatus)}</b>${driver?`<div class="rider-name">Delivery Person: <b>${esc(driver)}</b></div>`:''}`;
  }
  const orderCard=box.closest('.order-card');
  const statusPill=orderCard?.querySelector('.status');
  if(statusPill && (deliveryStatus==='Out for Delivery'||deliveryStatus==='Delivered')){
    statusPill.textContent=deliveryStatus;
    statusPill.className='status '+statusClass(deliveryStatus);
  }
}

async function setDelivery(id,deliveryStatus){
  const input=$('driver-'+id);
  const box=input?.closest('.delivery-admin-box');
  const draft=getDeliveryDraft(id);
  const driver=(input?.value||draft.rider_name||'').trim();
  const currentStatus=String(box?.dataset?.deliveryStatus || draft.delivery_status || 'Unassigned').trim() || 'Unassigned';
  if(!driver){ alert('Please enter the delivery person / rider name first.'); input?.focus(); return; }
  const required={'Assigned':'Unassigned','Picked Up':'Assigned','Out for Delivery':'Picked Up','Delivered':'Out for Delivery'}[deliveryStatus];
  if(required && currentStatus!==required){ alert(`Please complete the delivery step: ${required}.`); return; }
  saveDeliveryDraft(id,{rider_name:driver});
  if(input) input.value=driver;
  const buttons=box?[...box.querySelectorAll('.delivery-actions button')]:[];
  buttons.forEach(b=>b.disabled=true);
  try{
    const r=await fetch('/.netlify/functions/update-delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,delivery_status:deliveryStatus,delivery_person:driver})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const saved=data.order||{};
    const savedDriver=String(saved.delivery_person||driver).trim()||driver;
    const savedStatus=String(saved.delivery_status||deliveryStatus).trim()||deliveryStatus;
    saveDeliveryDraft(id,{rider_name:savedDriver,delivery_status:savedStatus});
    if(input) input.value=savedDriver;
    applyDeliveryUI(id,savedStatus,savedDriver);
    if(savedStatus==='Delivered') alert('Delivered ✅\nDelivery person: '+savedDriver);
    else { const next=nextDeliveryStep(savedStatus); if(next) alert(savedStatus+' ✅\nDelivery person: '+savedDriver+'\nNext: '+next); }
  }catch(e){
    saveDeliveryDraft(id,{rider_name:driver,delivery_status:currentStatus});
    if(input) input.value=driver;
    if(box) box.dataset.deliveryStatus=currentStatus;
    buttons.forEach(b=>b.disabled=false);
    applyDeliveryUI(id,currentStatus,driver);
    alert('Delivery update failed and was NOT saved to the database.\n\n'+e.message+'\n\nPlease check Netlify environment variable SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function nextDeliveryStep(status){
  return ({'Assigned':'Picked Up','Picked Up':'Out for Delivery','Out for Delivery':'Delivered'}[status]||null);
}

// Persist every rider-name keystroke so background refreshes cannot clear it.
document.addEventListener('input',e=>{if(e.target?.classList?.contains('driver-input')){const id=e.target.id.replace('driver-',''); const v=e.target.value.trim(); saveDeliveryDraft(id,{rider_name:v});}});

function notifyNewOrder(){
  try{ if('Notification' in window && Notification.permission==='granted') new Notification('Sahodara Pharmacy - New Order',{body:'A new customer order has arrived.'}); }catch(_){}
  try{ const C=window.AudioContext||window.webkitAudioContext;if(C){const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.value=.06;o.start();o.stop(c.currentTime+.25);} }catch(_){}
}
function startAutoRefresh(){
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=setInterval(loadOrders,60000);
  try{if('Notification' in window && Notification.permission==='default')Notification.requestPermission();}catch(_){}
}


/* Offers & analytics */
let offers=[];
async function loadOffers(){try{offers=await api(OFFERS_ENDPOINT+'?select=*&order=created_at.desc')||[];}catch(e){offers=[]}populateOfferProducts();renderOffersAdmin()}
function populateOfferProducts(){const s=$('offerGift');if(!s)return;s.innerHTML='<option value="">No free gift</option>'+products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ₹${money(p.price||0)}</option>`).join('')}
async function addOffer(){const title=$('offerTitle').value.trim(),description=$('offerDescription').value.trim(),min=Number($('offerMin').value||0),disc=Number($('offerDiscount').value||0),gift=$('offerGift').value,giftp=products.find(p=>String(p.id)===String(gift)),giftValue=Number($('offerGiftValue').value||giftp?.price||0);if(!title){alert('Enter an offer title.');return}try{await api(OFFERS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({id:'offer'+Date.now(),title,description,min_order:min,discount_percent:disc,gift_product_id:gift||null,gift_product_name:giftp?.name||null,gift_value:giftValue,active:true,created_at:new Date().toISOString()})});['offerTitle','offerDescription','offerMin','offerDiscount','offerGiftValue'].forEach(id=>{if($(id))$(id).value=''});await loadOffers();alert('Offer created. It is now visible in the customer app.')}catch(e){alert('Could not create offer. '+e.message)}}
function renderOffersAdmin(){const el=$('offerList');if(!el)return;el.innerHTML=offers.length?offers.map(o=>`<div class="product-card"><b>${esc(o.title)}</b><div class="muted">${esc(o.description||'')}</div><div class="offer-admin-meta">Minimum ₹${money(o.min_order||0)} ${o.discount_percent?`• ${o.discount_percent}% off`:''} ${o.gift_product_name?`• Free: ${esc(o.gift_product_name)} worth ₹${money(o.gift_value||0)}`:''}</div><div class="product-actions"><button onclick="toggleOffer('${esc(o.id)}',${!o.active})">${o.active?'Hide':'Activate'}</button><button class="danger" onclick="deleteOffer('${esc(o.id)}')">Delete</button></div></div>`).join(''):'<div class="empty">No offers created yet.</div>'}
async function toggleOffer(id,active){try{await api(OFFERS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({active})});await loadOffers()}catch(e){alert(e.message)}}
async function deleteOffer(id){if(!confirm('Delete this offer?'))return;try{await api(OFFERS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});await loadOffers()}catch(e){alert(e.message)}}
async function renderAnalytics(){const el=$('analyticsCards');if(!el)return;try{const rows=await api(ORDERS_ENDPOINT+'?select=id,total,status,created_at');const now=new Date();const today=rows.filter(o=>new Date(o.created_at).toDateString()===now.toDateString());const revenue=today.filter(o=>o.status==='Delivered').reduce((s,o)=>s+Number(o.total||0),0);el.innerHTML=[['Today Orders',today.length],['New Orders',rows.filter(o=>normalizeStatus(o.status)==='New').length],['Out for Delivery',rows.filter(o=>normalizeStatus(o.status)==='Out for Delivery').length],['Delivered Revenue','₹'+money(revenue)],['Total Orders',rows.length]].map(([a,b])=>`<div class="analytics-card"><b>${esc(b)}</b><span>${esc(a)}</span></div>`).join('')}catch(e){el.innerHTML='<div class="empty">Could not load analytics.</div>'}}

/* Product management */
async function loadProducts(){
  const e=$('productError');e.classList.add('hidden');
  try{
    products=await api(PRODUCTS_ENDPOINT+'?select=id,name,brand,formula,price,mrp,image,stock_quantity&order=created_at.asc')||[];
    renderProducts();
  }catch(err){
    e.textContent='Could not load products.\n'+err.message;e.classList.remove('hidden');
  }
}
async function uploadProductImage(file,id){
  if(!file)return '';
  const ext=(file.name||'jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=id+'-'+Date.now()+'.'+ext;
  const r=await fetch(STORAGE_ENDPOINT+'/'+STORAGE_BUCKET+'/'+encodeURIComponent(path),{
    method:'POST',headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},body:file
  });
  if(!r.ok)throw new Error('Image upload '+r.status+': '+await r.text());
  return SUPABASE_URL+'/storage/v1/object/public/'+STORAGE_BUCKET+'/'+path;
}
function normalizeProductName(name){
  return String(name||'').trim().toLowerCase().replace(/\s+/g,' ').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'\"');
}
function findDuplicateProduct(name, excludeId=''){
  const key=normalizeProductName(name);
  if(!key) return null;
  return products.find(p=>String(p.id)!==String(excludeId) && normalizeProductName(p.name)===key) || null;
}

async function addProduct(){
  const name=$('newName').value.trim(),brand=$('newBrand').value.trim(),formula=$('newFormula').value.trim(),price=Number($('newPrice').value),mrp=Number($('newMrp').value),stock_quantity=Math.floor(Number($('newQty').value)),file=$('newImage').files?.[0];
  if(!name||!Number.isFinite(price)||price<0){alert('Enter a product name and valid selling price.');return}
  const duplicate=findDuplicateProduct(name);
  if(duplicate){
    alert(`Duplicate product warning\n\n\"${duplicate.name}\" is already added.\n\nThis product will NOT be uploaded again.`);
    $('newName').focus();
    return;
  }
  if(!Number.isFinite(stock_quantity)||stock_quantity<0){alert('Enter a valid available quantity.');return}
  if(Number.isFinite(mrp)&&mrp>0&&mrp<price){alert('MRP cannot be lower than selling price.');return}
  try{
    const id='c'+Date.now(),image=await uploadProductImage(file,id);
    const p={id,name,brand,formula,price,mrp:(Number.isFinite(mrp)&&mrp>0?mrp:price),image,stock_quantity};
    await api(PRODUCTS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(p)});
    $('newName').value='';$('newBrand').value='';$('newFormula').value='';$('newPrice').value='';$('newMrp').value='';$('newQty').value='6';$('newImage').value='';$('newPreview').src='';$('newPreview').classList.add('hidden');
    await loadProducts();
    alert('Product added successfully. It will sync to the customer app.');
  }catch(e){alert('Could not add product.\n\n'+e.message)}
}
function renderProducts(){
  const q=($('productSearch').value||'').trim().toLowerCase();
  const list=products.filter(p=>String(p.name||'').toLowerCase().includes(q)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base',numeric:true}));
  $('lowStockHint').textContent=list.filter(p=>Number(p.stock_quantity||0)>0&&Number(p.stock_quantity||0)<=5).length+' low-stock product(s)';
  $('productList').innerHTML=list.length?list.map(p=>`
    <div class="product-card">
      <div class="product-card-grid">
        ${`<img src="${esc(p.image||'sahodara-logo.jpeg')}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='sahodara-logo.jpeg';">`}
        <div>
          <input id="en${esc(p.id)}" value="${esc(p.name)}" placeholder="Product name">
          <div class="form-grid edit-product-fields" style="margin-top:8px">
            <div><label class="field-label optional-label">Brand Name <span>OPTIONAL</span></label><input id="eb${esc(p.id)}" value="${esc(p.brand||'')}" placeholder="e.g. Crocin"></div>
            <div><label class="field-label">Formula</label><input id="ef${esc(p.id)}" value="${esc(p.formula||'')}" placeholder="e.g. Paracetamol 650 mg"></div>
            <div><label class="field-label">Selling Price</label><input id="ep${esc(p.id)}" type="number" value="${Number(p.price||0)}" min="0" step="0.01" placeholder="Price"></div>
            <div><label class="field-label">MRP</label><input id="em${esc(p.id)}" type="number" value="${Number(p.mrp||p.price||0)}" min="0" step="0.01" placeholder="MRP"></div>
            <div><label class="field-label quantity-label">Available Quantity</label><input id="eq${esc(p.id)}" type="number" value="${Number.isFinite(Number(p.stock_quantity))?Number(p.stock_quantity):6}" min="0" step="1" placeholder="e.g. 3"><span class="stock-admin-badge ${Number(p.stock_quantity||0)<=5?'low':''}">${Number(p.stock_quantity||0)===0?'OUT OF STOCK':Number(p.stock_quantity||0)<=5?'LOW STOCK':'IN STOCK'}</span></div>
          </div>
          <div class="photo-actions">
            <button type="button" onclick="chooseEditGallery('${esc(p.id)}')">Choose Photo</button>
            <button type="button" onclick="takeEditPhoto('${esc(p.id)}')">Take Photo</button>
          </div>
          <input id="ei${esc(p.id)}" class="file-hidden" type="file" accept="image/*">
          <input id="ec${esc(p.id)}" class="file-hidden" type="file" accept="image/*" capture="environment" onchange="syncEditCamera('${esc(p.id)}')">
          <div class="product-actions"><button class="primary" onclick="editProduct('${esc(p.id)}')">Save Changes</button><button class="danger" onclick="deleteProduct('${esc(p.id)}')">Delete</button></div>
        </div>
      </div>
    </div>`).join(''):'<div class="empty">No products found.</div>';
}
function chooseGallery(){$('newImage').click()}
function takePhoto(){$('newCamera').click()}
function syncCameraToNewImage(){
  const c=$('newCamera'),g=$('newImage');if(c.files?.[0]){const dt=new DataTransfer();dt.items.add(c.files[0]);g.files=dt.files}
}
function chooseEditGallery(id){$('ei'+id).click()}
function takeEditPhoto(id){$('ec'+id).click()}
function syncEditCamera(id){
  const c=$('ec'+id),g=$('ei'+id);if(c.files?.[0]){const dt=new DataTransfer();dt.items.add(c.files[0]);g.files=dt.files}
}
async function editProduct(id){
  const p=products.find(x=>String(x.id)===String(id));if(!p)return;
  const name=$('en'+id).value.trim(),brand=$('eb'+id).value.trim(),formula=$('ef'+id).value.trim(),price=Number($('ep'+id).value),mrp=Number($('em'+id).value),stock_quantity=Math.floor(Number($('eq'+id).value)),file=$('ei'+id).files?.[0];
  if(!name||!Number.isFinite(price)||price<0){alert('Enter a valid product name and selling price.');return}
  if(!Number.isFinite(stock_quantity)||stock_quantity<0){alert('Enter a valid available quantity.');return}
  if(Number.isFinite(mrp)&&mrp>0&&mrp<price){alert('MRP cannot be lower than selling price.');return}
  try{
    const image=file?await uploadProductImage(file,id):(p.image||'');
    await api(PRODUCTS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({name,brand,formula,price,mrp:(Number.isFinite(mrp)&&mrp>0?mrp:price),image,stock_quantity})});
    await loadProducts();alert('Product updated successfully.');
  }catch(e){alert('Could not update product.\n\n'+e.message)}
}
async function deleteProduct(id){
  if(!confirm('Delete this product from the customer store?'))return;
  try{
    await api(PRODUCTS_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});
    await loadProducts();alert('Product deleted.');
  }catch(e){alert('Could not delete product.\n\n'+e.message)}
}
function previewImage(input,target){
  const file=input.files?.[0];if(!file)return;
  const r=new FileReader();r.onload=e=>{$(target).src=e.target.result;$(target).classList.remove('hidden')};r.readAsDataURL(file);
}


/* Advertisement / slide management */
let adSlides=[];
async function loadAdSlides(){
  const e=$('adError'); if(!e)return;
  e.classList.add('hidden');
  try{
    adSlides=await api(SLIDES_ENDPOINT+'?select=id,image,title,subtitle,link,active,sort_order,created_at&order=sort_order.asc,created_at.asc')||[];
    renderAdSlides();
  }catch(err){
    adSlides=[]; renderAdSlides();
    e.textContent='Could not load ad slides. Run the provided ad-slides SQL setup first.\n'+err.message;e.classList.remove('hidden');
  }
}
function chooseAdGallery(){$('newAdImage').click()}
function takeAdPhoto(){$('newAdCamera').click()}
function syncAdCameraToGallery(){
  const c=$('newAdCamera'),g=$('newAdImage');
  if(c.files?.[0]){const dt=new DataTransfer();dt.items.add(c.files[0]);g.files=dt.files}
}
async function uploadAdImage(file,id){
  if(!file) return '';
  const ext=(file.name||'jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path='ad-'+id+'-'+Date.now()+'.'+ext;
  const r=await fetch(STORAGE_ENDPOINT+'/'+STORAGE_BUCKET+'/'+encodeURIComponent(path),{
    method:'POST',headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},body:file
  });
  if(!r.ok)throw new Error('Ad image upload '+r.status+': '+await r.text());
  return SUPABASE_URL+'/storage/v1/object/public/'+STORAGE_BUCKET+'/'+path;
}
async function addAdSlide(){
  if(adSlides.length>=3){alert('Maximum 3 slides allowed. Delete an old slide before adding a new one.');return}
  const file=$('newAdImage').files?.[0];
  if(!file){alert('Please choose a slide image.');return}
  const title=$('newAdTitle').value.trim(),subtitle=$('newAdSubtitle').value.trim(),link=$('newAdLink').value.trim();
  try{
    const id='ad'+Date.now(),image=await uploadAdImage(file,id);
    const slide={id,image,title,subtitle,link,active:true,sort_order:adSlides.length};
    await api(SLIDES_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(slide)});
    $('newAdImage').value='';$('newAdCamera').value='';$('newAdTitle').value='';$('newAdSubtitle').value='';$('newAdLink').value='';$('newAdPreview').src='';$('newAdPreview').classList.add('hidden');
    await loadAdSlides();
    alert('Slide added successfully. It will appear in the customer app within a few seconds.');
  }catch(e){alert('Could not add slide.\n\n'+e.message)}
}
function renderAdSlides(){
  const el=$('adList');if(!el)return;
  el.innerHTML=adSlides.length?adSlides.map((s,i)=>`
    <div class="slide-card">
      <div class="slide-thumb"><img src="${esc(s.image)}" alt="${esc(s.title||'Slide '+(i+1))}"></div>
      <div class="slide-main">
        <div class="slide-topline"><b>Slide ${i+1}</b><span class="active-badge ${s.active?'on':''}">${s.active?'Active':'Hidden'}</span></div>
        <div class="slide-meta"><b>${esc(s.title||'Untitled slide')}</b>${s.subtitle?`<span>${esc(s.subtitle)}</span>`:''}${s.link?`<small>${esc(s.link)}</small>`:''}</div>
        <div class="slide-actions">
          <button onclick="moveAdSlide('${esc(s.id)}',-1)" ${i===0?'disabled':''}>← Move Left</button>
          <button onclick="moveAdSlide('${esc(s.id)}',1)" ${i===adSlides.length-1?'disabled':''}>Move Right →</button>
          <button onclick="toggleAdSlide('${esc(s.id)}')">${s.active?'Hide':'Show'}</button>
          <button class="danger" onclick="deleteAdSlide('${esc(s.id)}')">Delete</button>
        </div>
      </div>
    </div>`).join(''):'<div class="empty">No slides added yet.</div>';
}
async function patchSlide(id,body){
  await api(SLIDES_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(body)});
}
async function toggleAdSlide(id){
  const s=adSlides.find(x=>String(x.id)===String(id));if(!s)return;
  try{await patchSlide(id,{active:!s.active});await loadAdSlides()}catch(e){alert('Could not change slide visibility.\n\n'+e.message)}
}
async function deleteAdSlide(id){
  if(!confirm('Delete this advertisement slide?'))return;
  try{await api(SLIDES_ENDPOINT+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});adSlides=adSlides.filter(x=>String(x.id)!==String(id));await normalizeAdOrder();await loadAdSlides()}catch(e){alert('Could not delete slide.\n\n'+e.message)}
}
async function moveAdSlide(id,delta){
  const i=adSlides.findIndex(x=>String(x.id)===String(id)),j=i+delta;
  if(i<0||j<0||j>=adSlides.length)return;
  const a=adSlides[i],b=adSlides[j];
  try{
    await patchSlide(a.id,{sort_order:b.sort_order});
    await patchSlide(b.id,{sort_order:a.sort_order});
    await loadAdSlides();
  }catch(e){alert('Could not reorder slides.\n\n'+e.message)}
}
async function normalizeAdOrder(){
  const sorted=[...adSlides].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
  for(let i=0;i<sorted.length;i++) await patchSlide(sorted[i].id,{sort_order:i});
}


/* Bulk product upload */
let bulkRows=[];
let bulkFileName='';
function chooseBulkFile(){ $('bulkFile')?.click(); }
function capText(v){ return String(v??'').trim().replace(/\s+/g,' ').toUpperCase(); }
function numOrNaN(v){ const n=Number(String(v??'').replace(/[,₹$]/g,'').trim()); return Number.isFinite(n)?n:NaN; }
function normalizeHeader(v){ return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
function downloadBulkTemplate(){
  const rows=[
    ['product_name','brand','formula','price','mrp','stock_quantity','image_url'],
    ['ATORVASTATIN','KNOLL','ATORVASTATIN 10 MG','120','150','10',''],
    ['DOLO 650','MICRO LABS','PARACETAMOL 650 MG','30','35','20','']
  ];
  const csv=rows.map(r=>r.map(x=>{const s=String(x);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Sahodara-Bulk-Products-Template.csv';document.body.appendChild(a);a.click();a.remove();
}
function parseCsv(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){ const c=text[i], n=text[i+1];
    if(c==='"' && quoted && n==='"'){cell+='"';i++;continue}
    if(c==='"'){quoted=!quoted;continue}
    if(c===',' && !quoted){row.push(cell);cell='';continue}
    if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&n==='\n')i++; row.push(cell);cell=''; if(row.some(x=>String(x).trim()!=='')){rows.push(row)} row=[]; continue}
    cell+=c;
  }
  row.push(cell); if(row.some(x=>String(x).trim()!==''))rows.push(row);
  return rows;
}
async function handleBulkFile(ev){
  const file=ev.target.files?.[0]; if(!file) return; bulkFileName=file.name;
  try{
    let matrix;
    const lower=file.name.toLowerCase();
    if(lower.endsWith('.csv')){ matrix=parseCsv(await file.text()); }
    else {
      if(typeof XLSX==='undefined') throw new Error('Excel reader is not available. Upload CSV instead or reconnect to the internet.');
      const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    }
    if(!matrix.length) throw new Error('The file is empty.');
    const rawHeaders=matrix[0].map(normalizeHeader);
    const alias={product:'product_name',name:'product_name',productname:'product_name',brand_name:'brand',company:'brand',company_name:'brand',formula_name:'formula',selling_price:'price',sale_price:'price',mrp_price:'mrp',stock:'stock_quantity',qty:'stock_quantity',quantity:'stock_quantity',image:'image_url',imageurl:'image_url'};
    const headers=rawHeaders.map(h=>alias[h]||h);
    if(!headers.includes('product_name')) throw new Error('Required column missing: product_name');
    const seen=new Set(products.map(p=>normalizeProductName(p.name)));
    const seenFile=new Set();
    bulkRows=matrix.slice(1).map((r,idx)=>{
      const o={row:idx+2}; headers.forEach((h,i)=>o[h]=r[i]??'');
      o.name=capText(o.product_name); o.brand=capText(o.brand); o.formula=capText(o.formula); o.image_url=String(o.image_url??'').trim();
      o.price=numOrNaN(o.price); o.mrp=numOrNaN(o.mrp); o.stock_quantity=Math.floor(numOrNaN(o.stock_quantity));
      const key=normalizeProductName(o.name); let status='READY', reason='';
      if(!key){status='SKIP';reason='Missing product name';}
      else if(seen.has(key)){status='SKIP';reason='Duplicate: already exists';}
      else if(seenFile.has(key)){status='SKIP';reason='Duplicate in this file';}
      else if(!Number.isFinite(o.price)||o.price<0){status='SKIP';reason='Invalid price';}
      else if(!Number.isFinite(o.stock_quantity)||o.stock_quantity<0){status='SKIP';reason='Invalid stock quantity';}
      else if(Number.isFinite(o.mrp)&&o.mrp>0&&o.mrp<o.price){status='SKIP';reason='MRP lower than selling price';}
      if(status==='READY')seenFile.add(key);
      o.status=status;o.reason=reason;return o;
    });
    renderBulkPreview();
  }catch(e){ alert('Could not read bulk file.\n\n'+e.message); cancelBulkUpload(); }
}
function escHtml(s){return esc(String(s??''));}
function renderBulkPreview(){
  const wrap=$('bulkPreviewWrap'), body=$('bulkPreviewBody'), sum=$('bulkSummary'); if(!wrap||!body)return;
  const ready=bulkRows.filter(r=>r.status==='READY').length, skip=bulkRows.length-ready;
  sum.textContent=`${ready} ready • ${skip} skipped • ${bulkFileName}`;
  body.innerHTML=bulkRows.map(r=>`<tr><td>${r.row}</td><td>${escHtml(r.name)}</td><td>${escHtml(r.brand)}</td><td>${escHtml(r.formula)}</td><td>${Number.isFinite(r.price)?'₹'+money(r.price):''}</td><td>${Number.isFinite(r.mrp)?'₹'+money(r.mrp):''}</td><td>${Number.isFinite(r.stock_quantity)?r.stock_quantity:''}</td><td class="${r.status==='READY'?'bulk-status-ok':'bulk-status-skip'}">${r.status==='READY'?'READY':'SKIP — '+escHtml(r.reason)}</td></tr>`).join('');
  wrap.classList.remove('hidden');
  const btn=$('bulkImportBtn'); if(btn){btn.disabled=ready===0;btn.textContent=ready?`Import ${ready} Valid Products`:'No Valid Products';}
}
async function importBulkProducts(){
  const ready=bulkRows.filter(r=>r.status==='READY'); if(!ready.length){alert('There are no valid products to import.');return;}
  const btn=$('bulkImportBtn'); if(btn){btn.disabled=true;btn.textContent='Importing…';}
  try{
    const stamp=Date.now();
    const payload=ready.map((r,i)=>({id:'bulk'+stamp+'_'+i+'_'+Math.random().toString(36).slice(2,7),name:r.name,brand:r.brand,formula:r.formula,price:r.price,mrp:(Number.isFinite(r.mrp)&&r.mrp>0?r.mrp:r.price),image:r.image_url||'',stock_quantity:r.stock_quantity}));
    await api(PRODUCTS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
    alert(`Successfully added ${payload.length} product(s). ${bulkRows.length-payload.length} row(s) were skipped.`);
    cancelBulkUpload(); await loadProducts();
  }catch(e){ if(btn){btn.disabled=false;btn.textContent=`Import ${ready.length} Valid Products`;} alert('Bulk import failed.\n\n'+e.message); }
}
function cancelBulkUpload(){bulkRows=[];bulkFileName='';const f=$('bulkFile');if(f)f.value='';$('bulkPreviewWrap')?.classList.add('hidden');$('bulkPreviewBody')?.replaceChildren();}
