const ADMIN_ID="admin";
const ADMIN_PASSWORD="Sai9390";
const SUPABASE_URL="https://coweieefkktidapxipdb.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_V5Po3mfFyMxn2alJswzSrA_D9zE_95D";
const PRODUCTS_ENDPOINT=`${SUPABASE_URL}/rest/v1/products`;
const STORAGE_BUCKET="product-images";
const STORAGE_ENDPOINT=`${SUPABASE_URL}/storage/v1/object`;
const SLIDES_ENDPOINT=`${SUPABASE_URL}/rest/v1/ad_slides`;
const AUTH_URL=`${SUPABASE_URL}/auth/v1`;
const PROFILE_ENDPOINT=`${SUPABASE_URL}/rest/v1/customer_profiles`;
const ADDRESSES_ENDPOINT=`${SUPABASE_URL}/rest/v1/customer_addresses`;
const WISHLIST_ENDPOINT=`${SUPABASE_URL}/rest/v1/customer_wishlist`;
const NOTIFICATIONS_ENDPOINT=`${SUPABASE_URL}/rest/v1/customer_notifications`;
const PUSH_SUBSCRIBE_ENDPOINT=`/.netlify/functions/subscribe-push`;
const ABANDONED_ENDPOINT=`/.netlify/functions/abandoned-product`;
const OFFERS_ENDPOINT=`${SUPABASE_URL}/rest/v1/customer_offers`;
const ORDER_USER_COLUMN='order_user_id';


let authSession=JSON.parse(localStorage.getItem('sahodaraAuthSession')||'null');
let currentUser=authSession?.user||null;
let currentProfile=null;
let activeAuthMode='login';
let activeAuthIdentifier='email';
let pendingPhone='';
let accountWishlist=JSON.parse(localStorage.getItem('sahodaraWishlistGuest')||'[]');
let accountAddresses=[];
let customerOffers=[];
let guestMode=localStorage.getItem("sahodoraGuestMode")==="true";

function authHeaders(extra={}){
 const h=Object.assign({'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json','Accept':'application/json'},extra);
 if(authSession?.access_token)h.Authorization=`Bearer ${authSession.access_token}`;
 return h;
}
async function authFetch(path,options={}){
 const res=await fetch(AUTH_URL+path,Object.assign({},options,{headers:authHeaders(options.headers||{})}));
 const t=await res.text(); let data=null; try{data=t?JSON.parse(t):null}catch(_){}
 if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||t||`Auth ${res.status}`);
 return data;
}
async function signUpAccount(identifier,password,fullName){
 const body={password,options:{data:{full_name:fullName||''}}};
 if(activeAuthIdentifier==='email')body.email=identifier;else body.phone=normalizePhone(identifier);
 return authFetch('/signup',{method:'POST',body:JSON.stringify(body)});
}
async function signInAccount(identifier,password){
 const body={password};
 if(activeAuthIdentifier==='email')body.email=identifier;else body.phone=normalizePhone(identifier);
 const data=await authFetch('/token?grant_type=password',{method:'POST',body:JSON.stringify(body)});
 setAuthSession(data); return data;
}
async function sendEmailRecovery(email){
 await authFetch('/recover',{method:'POST',body:JSON.stringify({email,redirect_to:location.origin+location.pathname})});
}
async function sendPhoneOtp(phone){
 await authFetch('/otp',{method:'POST',body:JSON.stringify({phone:normalizePhone(phone),create_user:false})});
 pendingPhone=normalizePhone(phone);
}
async function verifyPhoneOtp(code){
 const data=await authFetch('/verify',{method:'POST',body:JSON.stringify({phone:pendingPhone,token:code,type:'sms'})});
 setAuthSession(data); return data;
}
function setAuthSession(data){
 authSession=data||null;currentUser=data?.user||null;
 if(data){guestMode=false;localStorage.removeItem('sahodaraGuestMode');}
 if(authSession)localStorage.setItem('sahodaraAuthSession',JSON.stringify(authSession));else localStorage.removeItem('sahodaraAuthSession');
 loadAccountBasket(); updateAccountUI();
}
function clearAuthSession(){
 if(authSession?.access_token)authFetch('/logout',{method:'POST'}).catch(()=>{});
 setAuthSession(null);
 guestMode=false;localStorage.removeItem('sahodoraGuestMode');
}
function normalizePhone(v){
 const raw=String(v||'').trim();
 if(raw.startsWith('+'))return raw;
 const digits=raw.replace(/\D/g,'');
 return digits?`+91${digits.slice(-10)}`:raw;
}
function loadAccountBasket(){
 const key=currentUser?`sahodaraBasket_${currentUser.id}`:'sahodaraBasket_guest';
 try{basket=JSON.parse(localStorage.getItem(key)||'{}')}catch(_){basket={}}
 renderBasket();
}
function saveAccountBasket(){
 const key=currentUser?`sahodaraBasket_${currentUser.id}`:'sahodaraBasket_guest';
 localStorage.setItem(key,JSON.stringify(basket));
}
function authDbRequest(url,options={}){
 return fetch(url,Object.assign({},options,{headers:authHeaders(options.headers||{})})).then(async r=>{
   const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}
   if(!r.ok)throw new Error(d?.message||d?.msg||d?.hint||t||`HTTP ${r.status}`);return d;
 });
}
async function loadProfile(){
 if(!currentUser)return;
 try{const rows=await authDbRequest(`${PROFILE_ENDPOINT}?user_id=eq.${encodeURIComponent(currentUser.id)}&select=*`);currentProfile=rows?.[0]||null;}catch(_){currentProfile=null}
}
async function saveProfile(data){
 if(!currentUser)return;
 const payload={user_id:currentUser.id,full_name:data.full_name||'',phone:data.phone||currentUser.phone||'',email:currentUser.email||data.email||''};
 await authDbRequest(PROFILE_ENDPOINT,{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});currentProfile=payload;
}
async function loadAddresses(){
 if(!currentUser){accountAddresses=[];return}
 try{accountAddresses=await authDbRequest(`${ADDRESSES_ENDPOINT}?user_id=eq.${encodeURIComponent(currentUser.id)}&select=*&order=is_default.desc,created_at.desc`)||[]}catch(_){accountAddresses=[]}
}
async function saveAddress(label,address,phone,isDefault=true){
 await authDbRequest(ADDRESSES_ENDPOINT,{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({user_id:currentUser.id,label,address,phone,is_default:isDefault})});await loadAddresses();
}
async function loadWishlist(){
 if(!currentUser)return;
 try{const rows=await authDbRequest(`${WISHLIST_ENDPOINT}?user_id=eq.${encodeURIComponent(currentUser.id)}&select=product_id`);accountWishlist=(rows||[]).map(r=>String(r.product_id));}
 catch(_){accountWishlist=JSON.parse(localStorage.getItem('sahodaraWishlistGuest')||'[]')}
}
async function toggleWishlist(id){
 const sid=String(id);if(!currentUser){accountWishlist=accountWishlist.includes(sid)?accountWishlist.filter(x=>x!==sid):[...accountWishlist,sid];localStorage.setItem('sahodaraWishlistGuest',JSON.stringify(accountWishlist));renderProducts();return}
 try{
   if(accountWishlist.includes(sid))await authDbRequest(`${WISHLIST_ENDPOINT}?user_id=eq.${encodeURIComponent(currentUser.id)}&product_id=eq.${encodeURIComponent(sid)}`,{method:'DELETE'});
   else await authDbRequest(WISHLIST_ENDPOINT,{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({user_id:currentUser.id,product_id:sid})});
   await loadWishlist();renderProducts();
 }catch(e){alert('Could not update wishlist. '+e.message)}
}
function isWishlisted(id){return accountWishlist.includes(String(id))}

let lastProductActivity=null;
let abandonedQueuedAt=0;
let pushRegistration=null;

function notificationProductText(p){
 const mrp=Number(p?.mrp||0), price=Number(p?.price||0);
 const off=mrp>0&&price>0?Math.max(0,Math.min(95,Math.round((mrp-price)/mrp*100))):0;
 return `${p?.name||'Product'} • MRP ₹${money(mrp||price)} • Selling ₹${money(price)} • ${off}% OFF`;
}
function rememberProductActivity(id,reason='view'){
 const p=productById(id); if(!p)return;
 lastProductActivity={id:String(p.id),name:String(p.name||''),price:Number(p.price||0),mrp:Number(p.mrp||0),reason,at:Date.now()};
 localStorage.setItem('sahodaraLastProductActivity',JSON.stringify(lastProductActivity));
}
function restoreProductActivity(){
 try{lastProductActivity=JSON.parse(localStorage.getItem('sahodaraLastProductActivity')||'null')}catch(_){lastProductActivity=null}
}
async function registerPushNotifications(){
 if(!currentUser || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return {ok:false,message:'Push notifications are not supported here.'};
 try{
   const permission=Notification.permission==='granted'? 'granted' : await Notification.requestPermission();
   if(permission!=='granted') return {ok:false,message:'Notification permission was not allowed.'};
   pushRegistration=await navigator.serviceWorker.ready;
   const publicKey=await fetch('/.netlify/functions/push-config').then(r=>r.ok?r.json():null).then(x=>x?.publicKey||'');
   if(!publicKey) return {ok:false,message:'Push notification server is not configured yet.'};
   const existing=await pushRegistration.pushManager.getSubscription();
   const sub=existing||await pushRegistration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(publicKey)});
   const res=await fetch(PUSH_SUBSCRIBE_ENDPOINT,{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({subscription:sub.toJSON()})});
   if(!res.ok) throw new Error(await res.text());
   localStorage.setItem('sahodaraPushEnabled','1');
   return {ok:true,message:'Notifications are enabled.'};
 }catch(e){return {ok:false,message:e.message||'Could not enable notifications.'}}
}
function base64UrlToUint8Array(base64String){
 const padding='='.repeat((4-base64String.length%4)%4);
 const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(base64); const out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i); return out;
}
async function clearAbandonedReminder(){
 if(!currentUser)return;
 try{await fetch(ABANDONED_ENDPOINT,{method:'DELETE',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({user_id:currentUser.id})})}catch(_){ }
}
function queueAbandonedReminder(){
 if(!currentUser || !lastProductActivity || !authSession?.access_token) return;
 if(Object.keys(basket||{}).length===0) return;
 if(Date.now()-abandonedQueuedAt<10000)return;
 abandonedQueuedAt=Date.now();
 const payload={user_id:currentUser.id,product:{id:lastProductActivity.id,name:lastProductActivity.name,price:lastProductActivity.price,mrp:lastProductActivity.mrp}};
 const opts={method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(payload),keepalive:true};
 fetch(ABANDONED_ENDPOINT,opts).catch(()=>{});
}
function trackProductNotificationActivity(id,reason){rememberProductActivity(id,reason);}

async function loadNotifications(){
 if(!currentUser)return [];
 try{return await authDbRequest(`${NOTIFICATIONS_ENDPOINT}?user_id=eq.${encodeURIComponent(currentUser.id)}&select=*&order=created_at.desc&limit=50`)||[]}catch(_){return []}
}
async function loadOffers(){
 try{customerOffers=await fetch(OFFERS_ENDPOINT+'?active=eq.true&select=*&order=created_at.desc',{headers:{apikey:SUPABASE_ANON_KEY,Accept:'application/json'}}).then(r=>r.ok?r.json():[]);}
 catch(_){customerOffers=[]}
 renderOffers();
}
function activeOfferForSubtotal(subtotal){
 return customerOffers.filter(o=>!o.starts_at||new Date(o.starts_at)<=new Date()).filter(o=>!o.ends_at||new Date(o.ends_at)>=new Date()).filter(o=>Number(o.min_order||0)<=subtotal).sort((a,b)=>Number(b.min_order||0)-Number(a.min_order||0))[0]||null;
}
function renderOffers(){
 const sec=$('offersSection'),grid=$('offersGrid');if(!sec||!grid)return;
 if(!customerOffers.length){sec.classList.add('hidden');return}
 sec.classList.remove('hidden');grid.innerHTML=customerOffers.map(o=>`<article class="offer-card"><span class="offer-tag">SPECIAL</span><h3>${escapeHtml(o.title||'Special Offer')}</h3><p>${escapeHtml(o.description||'Limited time offer')}</p><b>${Number(o.min_order||0)>0?`Buy ₹${money(o.min_order)}+`:''}${o.gift_product_name?` • Get ${escapeHtml(o.gift_product_name)} free`:''}${Number(o.discount_percent||0)>0?` • ${o.discount_percent}% off`:''}</b></article>`).join('');
}
function updateAccountUI(){
 const label=$('accountLabel');if(label)label.textContent=currentUser?(currentUser.email||currentUser.phone||'Account'):(guestMode?'Guest':'Login');
}
async function initAuth(){
 updateAccountUI();
 if(authSession?.access_token){
  try{const u=await authFetch('/user');currentUser=u;await Promise.all([loadProfile(),loadAddresses(),loadWishlist()]);updateAccountUI();}
  catch(_){clearAuthSession()}
 }
 handleRecoveryUrl();
}
function handleRecoveryUrl(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const type=hash.get('type');const access=hash.get('access_token');
 if(type==='recovery'&&access){authSession={access_token:access,token_type:'bearer'};localStorage.setItem('sahodaraAuthSession',JSON.stringify(authSession));authOpenReset();}
}

async function uploadProductImage(file, productId){
 if(!file) return "";
 const ext=(file.name||"jpg").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
 const path=`${productId}-${Date.now()}.${ext}`;
 const headers={"apikey":SUPABASE_ANON_KEY,"Content-Type":file.type||"image/jpeg","x-upsert":"true"};
 const res=await fetch(`${STORAGE_ENDPOINT}/${STORAGE_BUCKET}/${encodeURIComponent(path)}`,{method:"POST",headers,body:file});
 if(!res.ok) throw new Error(await res.text());
 return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

async function supabaseRequest(path="", options={}){
 const headers=Object.assign({"apikey":SUPABASE_ANON_KEY}, options.headers||{});
 const res=await fetch(PRODUCTS_ENDPOINT+path,Object.assign({},options,{headers}));
 if(!res.ok) throw new Error(await res.text());
 return res.status===204?null:res.json();
}
async function loadProductsFromCloud(){
 try{
  let rows;
  try{
   rows=await supabaseRequest("?select=id,name,brand,formula,price,mrp,image,stock_quantity&order=created_at.asc");
  }catch(_){
   // Backward compatibility if the new optional columns have not been added yet.
   rows=await supabaseRequest("?select=id,name,price,mrp,image&order=created_at.asc");
   rows=(Array.isArray(rows)?rows:[]).map(p=>({...p,brand:"",formula:"",stock_quantity:6}));
  }
  customProducts=Array.isArray(rows)?rows:[];
  localStorage.setItem("sahodaraProducts",JSON.stringify(customProducts));
  renderProducts();renderRecentlyViewed();renderAdminProducts();
  openSharedProductFromUrl();
 }catch(e){console.warn("Supabase product load failed; using local cache.",e)}
}
async function upsertProductCloud(product){
 await supabaseRequest("",{method:"POST",headers:{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(product)});
}
async function deleteProductCloud(id){
 await supabaseRequest(`?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
}

const defaultProducts=[
 {id:"p1",name:"Digital Thermometer",brand:"",formula:"",price:120,image:"",stock_quantity:6},
 {id:"p2",name:"Hand Sanitizer",brand:"",formula:"",price:99,image:"",stock_quantity:6},
 {id:"p3",name:"Face Mask",brand:"",formula:"",price:50,image:"",stock_quantity:6},
 {id:"p4",name:"First Aid Kit",brand:"",formula:"",price:399,image:"",stock_quantity:6},
 {id:"p5",name:"Hot Water Bag",brand:"",formula:"",price:299,image:"",stock_quantity:6}
];

let customProducts=JSON.parse(localStorage.getItem("sahodaraProducts")||"[]");
let basket=JSON.parse(localStorage.getItem("sahodaraBasket")||"{}");
let recentlyViewed=JSON.parse(localStorage.getItem("sahodaraRecentlyViewed")||"[]");
let pendingDelete=null;

const $=id=>document.getElementById(id);
const allProducts=()=>defaultProducts.concat(customProducts);
const money=n=>Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function productById(id){return allProducts().find(p=>String(p.id)===String(id))}

let activeCategory='all';
function setCategory(category){
  activeCategory=category||'all';
  document.querySelectorAll('.category-pill').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===activeCategory));
  document.getElementById('products')?.scrollIntoView({behavior:'smooth',block:'start'});
  renderProducts();
}
function fuzzyMatch(q,hay){ if(!q)return true; const words=hay.split(/\s+/); return q.split(/\s+/).every(token=>words.some(w=>w.startsWith(token.slice(0,Math.max(2,token.length-1)))));}
function productDiscountPercent(p){
  const price=Number(p.price||0), mrp=Number(p.mrp||0);
  if(!(mrp>price) || price<=0) return 0;
  return Math.round((1-(price/mrp))*100);
}
function matchesCategory(p){
  if(activeCategory==='all') return true;
  if(activeCategory==='brand') return !!String(p.brand||'').trim();
  if(activeCategory==='formula') return !!String(p.formula||'').trim();
  const d=productDiscountPercent(p);
  if(activeCategory==='discount20') return d>=1 && d<=20;
  if(activeCategory==='discount50') return d>=21 && d<=49;
  if(activeCategory==='discount95') return d>=50 && d<=95;
  return true;
}
function saveAll(){localStorage.setItem("sahodaraProducts",JSON.stringify(customProducts));saveAccountBasket();localStorage.setItem("sahodaraRecentlyViewed",JSON.stringify(recentlyViewed))}
function imageMarkup(p,cls=""){const src=p.image||"sahodara-logo.jpeg";return `<img class="${cls}" src="${src}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null;this.src='sahodara-logo.jpeg';">`}


async function shareProduct(id){
  const p = productById(id);
  if(!p) return;

  const shareText = `${p.name} — ₹${money(p.price)}\nSahodara Pharmacy`;
  // Create a real product-specific link. When the recipient opens it,
  // the app reads ?product=... and opens that exact product.
  const shareLink = new URL(window.location.href);
  shareLink.hash = "";
  shareLink.searchParams.set("product", String(p.id));
  const shareUrl = shareLink.toString();

  if(navigator.share){
    try{
      await navigator.share({
        title: p.name,
        text: shareText,
        url: shareUrl
      });
    }catch(e){}
    return;
  }

  const fallback = `${shareText}\n${shareUrl}`;
  try{
    await navigator.clipboard.writeText(fallback);
    alert("Product link copied. You can paste it into WhatsApp, Messages, or any other app.");
  }catch(e){
    window.prompt("Copy this product link:", fallback);
  }
}

function renderSearchSuggestions(){
 const input=$('searchInput'), box=$('searchSuggestions');if(!input||!box)return;const q=input.value.trim().toLowerCase();if(!q){box.classList.add('hidden');return}
 const hits=allProducts().filter(p=>`${p.name||''} ${p.brand||''} ${p.formula||''}`.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,6);
 box.innerHTML=hits.length?hits.map(p=>`<button type="button" onclick="selectSearchSuggestion('${p.id}')"><b>${escapeHtml(p.name)}</b>${p.brand?` <span>${escapeHtml(p.brand)}</span>`:''}</button>`).join(''):'<div class="suggestion-empty">No close match</div>';
 box.classList.remove('hidden');
}
function selectSearchSuggestion(id){const p=productById(id);if(p){$('searchInput').value=p.name;renderProducts();openProduct(id)}$('searchSuggestions')?.classList.add('hidden')}

function updateBrandNameScroll(){
  document.querySelectorAll(".brand-chip").forEach(chip=>{
    const text=chip.querySelector(".brand-chip-text");
    if(!text)return;
    const overflow=Math.max(0,text.scrollWidth-chip.clientWidth+4);
    const needsScroll=overflow>2;
    chip.style.setProperty("--brand-shift", `-${overflow}px`);
    chip.classList.toggle("brand-scroll",needsScroll);
    if(needsScroll){
      chip.onmouseenter=()=>chip.classList.add("brand-scroll-active");
      chip.onmouseleave=()=>chip.classList.remove("brand-scroll-active");
      chip.ontouchstart=()=>chip.classList.add("brand-scroll-active");
      chip.ontouchend=()=>setTimeout(()=>chip.classList.remove("brand-scroll-active"),900);
    }else{
      chip.onmouseenter=chip.onmouseleave=chip.ontouchstart=chip.ontouchend=null;
    }
  });
}

function renderProducts(){
 const q=$("searchInput").value.trim().toLowerCase();
 renderSearchSuggestions();
 const list=allProducts()
   .filter(p=>{const hay=`${p.name||''} ${p.brand||''} ${p.formula||''}`.toLowerCase();return hay.includes(q)||fuzzyMatch(q,hay)})
   .filter(matchesCategory)
   .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base',numeric:true}));
 $("productCount").textContent=`${list.length} product${list.length===1?"":"s"}`;
 $("productGrid").innerHTML=list.length?list.map(p=>`
  <article class="product-card">
     <button class="wishlist-product-btn" aria-label="Wishlist" onclick="event.stopPropagation();toggleWishlist('${p.id}')">${isWishlisted(p.id)?'♥':'♡'}</button>
     <button class="share-product-btn" aria-label="Share ${p.name}" title="Share product" onclick="event.stopPropagation();shareProduct('${p.id}')">
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
         <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
         <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"></path>
       </svg>
     </button>
   <div class="product-image" onclick="openProduct('${p.id}')">${imageMarkup(p)}</div>
   <div class="product-title-row"><h3>${escapeHtml(p.name)}</h3>${p.brand?`<span class="brand-chip"><span class="brand-chip-text">${escapeHtml(p.brand)}</span></span>`:""}</div>
   ${p.formula?`<div class="formula-text">${escapeHtml(p.formula)}</div>`:""}
   <div class="price">₹${money(p.price)}${p.mrp&&Number(p.mrp)>Number(p.price)?` <span class="mrp">₹${money(p.mrp)}</span><span class="discount">${Math.round((1-(Number(p.price)/Number(p.mrp)))*100)}% OFF</span>`:""}</div>
   <div class="stock-text ${productStock(p)<=0?'out':''}">${productStock(p)<=0?'Out of stock':`Available: ${productStock(p)}`}</div>
   <button class="add-btn" ${productStock(p)<=0?'disabled':''} onclick="addToBasket('${p.id}')">${productStock(p)<=0?'Out of Stock':'Add to Basket'}</button>
  </article>`).join(""):`<div class="empty no-results">No products found.</div>`;
 requestAnimationFrame(updateBrandNameScroll);
}

function renderRecentlyViewed(){
 const list=recentlyViewed.map(productById).filter(Boolean);
 $("recentGrid").innerHTML=list.length?list.map(p=>`
  <div class="recent-card" onclick="openProduct('${p.id}')">
   <div class="product-image">${imageMarkup(p)}</div>
   <div class="product-title-row"><h3>${escapeHtml(p.name)}</h3>${p.brand?`<span class="brand-chip"><span class="brand-chip-text">${escapeHtml(p.brand)}</span></span>`:""}</div>
   ${p.formula?`<div class="formula-text">${escapeHtml(p.formula)}</div>`:""}
   <div class="price">₹${money(p.price)}${p.mrp&&Number(p.mrp)>Number(p.price)?` <span class="mrp">₹${money(p.mrp)}</span><span class="discount">${Math.round((1-(Number(p.price)/Number(p.mrp)))*100)}% OFF</span>`:""}</div>
  </div>`).join(""):`<div class="empty">Products you view will appear here.</div>`;
 requestAnimationFrame(updateBrandNameScroll);
}

let zoomLevel=1;
function handleProductImageClick(id){
 const p=productById(id);
 if(p && p.image) openImageZoom(id); else openProduct(id);
}
function openImageZoom(id){
 const p=productById(id); if(!p||!p.image){openProduct(id);return}
 zoomLevel=1;
 const img=$("zoomedProductImage");
 img.src=p.image||"sahodara-logo.jpeg"; img.style.transform="scale(1)"; img.classList.remove("zoomed");
 $("imageLightbox").classList.add("show"); document.body.style.overflow="hidden";
}
function closeImageZoom(event){
 if(event && event.target && event.target.id!=="imageLightbox") return;
 $("imageLightbox").classList.remove("show"); document.body.style.overflow=""; zoomLevel=1;
}
function zoomImage(delta){
 zoomLevel=Math.min(4,Math.max(1,zoomLevel+delta));
 const img=$("zoomedProductImage");
 img.style.transform=`scale(${zoomLevel})`; img.classList.toggle("zoomed",zoomLevel>1);
}
function toggleImageZoom(event){
 event.stopPropagation(); zoomImage(zoomLevel>1?-1:1);
}
document.addEventListener("wheel",e=>{
 const box=$("imageLightbox");
 if(box&&box.classList.contains("show")){e.preventDefault();zoomImage(e.deltaY<0?.25:-.25)}
},{passive:false});

function openProduct(id){
 const p=productById(id);if(!p)return;
 rememberProductActivity(id,'view');
 recentlyViewed=[String(id),...recentlyViewed.map(String).filter(x=>x!==String(id))].slice(0,10);saveAll();
 $("productOverview").innerHTML=`
  <div class="overview-image">${imageMarkup(p)}</div>
  <div class="overview-info"><div class="overview-title-row"><h2>${escapeHtml(p.name)}</h2>${p.brand?`<span class="brand-chip"><span class="brand-chip-text">${escapeHtml(p.brand)}</span></span>`:""}</div>${p.formula?`<div class="formula-text overview-formula">${escapeHtml(p.formula)}</div>`:""}<div class="price">₹${money(p.price)}${p.mrp&&Number(p.mrp)>Number(p.price)?` <span class="mrp">₹${money(p.mrp)}</span><span class="discount">${Math.round((1-(Number(p.price)/Number(p.mrp)))*100)}% OFF</span>`:""}</div>
  <p>View product details and add it to your basket.</p>
  <div class="stock-text ${productStock(p)<=0?'out':''}">${productStock(p)<=0?'Out of stock':`Available: ${productStock(p)}`}</div>
  <button class="primary full" ${productStock(p)<=0?'disabled':''} onclick="addToBasket('${p.id}');closeProduct()">${productStock(p)<=0?'Out of Stock':'Add to Basket'}</button></div>`;
 $("productModal").classList.add("show");renderRecentlyViewed();
}
function closeProduct(){$("productModal").classList.remove("show")}

function productStock(p){
 const n=Number(p?.stock_quantity);
 return Number.isFinite(n)?Math.max(0,Math.floor(n)):6;
}
function addToBasket(id){
 const p=productById(id); if(!p)return;
 rememberProductActivity(id,'basket');
 const current=basket[id]||0;
 const stock=productStock(p);
 if(stock<=0){alert("This product is currently out of stock.");return}
 if(current>=stock){alert(`Only ${stock} quantity available for this product.`);return}
 const limit=Math.min(6,stock);
 if(current>=limit){alert(`Maximum ${limit} quantity allowed for this product.`);return}

 basket[id]=Math.min(limit,current+1);
 saveAll();
 renderBasket();

 // Open the basket only for the very first product added in this session.
 // Every later product stays on the shopping page.
 if(!window.__basketOpenedOnce){
   window.__basketOpenedOnce=true;
   openBasket();
 }else{
   showBasketAddedFeedback();
 }
}
function showBasketAddedFeedback(){
 const basketLink=document.querySelector(".basket-link");
 if(basketLink){
   basketLink.classList.remove("basket-eating");
   void basketLink.offsetWidth;
   basketLink.classList.add("basket-eating");
   setTimeout(()=>basketLink.classList.remove("basket-eating"),700);
 }
 const toast=document.createElement("div");
 toast.className="product-added-toast";
 toast.textContent="✓ Added to basket";
 document.body.appendChild(toast);
 requestAnimationFrame(()=>toast.classList.add("show"));
 setTimeout(()=>{
   toast.classList.remove("show");
   setTimeout(()=>toast.remove(),250);
 },1400);
}

function changeQty(id,d){
 const p=productById(id); if(!p)return;
 const current=basket[id]||1;
 const stock=productStock(p);
 const limit=Math.min(6,stock);
 if(d>0 && current>=limit){alert(stock>0?`Only ${stock} quantity available for this product.`:"This product is currently out of stock.");return}

 // Minimum quantity is 1. Reducing 1 does NOT remove the product.
 const next=Math.min(limit,Math.max(1,current+d));
 basket[id]=next;

 saveAll();
 renderBasket();
}
function requestDelete(id){pendingDelete=String(id);$("deleteModal").classList.add("show")}
function closeDelete(){pendingDelete=null;$("deleteModal").classList.remove("show")}
function confirmDelete(){if(pendingDelete!==null)delete basket[pendingDelete];saveAll();renderBasket();closeDelete()}

function basketTotals(){
 let subtotal=Object.entries(basket).reduce((s,[id,q])=>{const p=productById(id);return p?s+p.price*q:s},0);
 let count=Object.values(basket).reduce((s,q)=>s+q,0);
 const offer=activeOfferForSubtotal(subtotal);
 const discountPct=Math.min(95,Math.max(0,Number(offer?.discount_percent||0)));
 const discountAmount=+(subtotal*discountPct/100).toFixed(2);
 const total=+(subtotal-discountAmount).toFixed(2);
 return{subtotal,count,offer,discountAmount,total};
}
function renderBasket(){
 Object.keys(basket).forEach(id=>{
   const p=productById(id);
   if(!p){delete basket[id];return}
   const limit=Math.min(6,productStock(p));
   if(limit<=0) delete basket[id];
   else basket[id]=Math.min(Math.max(1,Number(basket[id]||1)),limit);
 });
 saveAll();
 const {subtotal,count}=basketTotals();$("basketCount").textContent=count;
 const entries=Object.entries(basket).filter(([id])=>productById(id));
 $("basketItems").innerHTML=entries.length?entries.map(([id,q])=>{const p=productById(id);return`
  <div class="basket-item">
   <div class="basket-thumb"><img src="${p.image||'sahodara-logo.jpeg'}" alt="" onerror="this.onerror=null;this.src='sahodara-logo.jpeg';"></div>
   <div><b>${escapeHtml(p.name)}</b><div>₹${money(p.price)}</div><small class="stock-text">Available: ${productStock(p)}</small><div class="qty"><button onclick="changeQty('${id}',-1)">-</button> ${q} <button onclick="changeQty('${id}',1)">+</button></div></div>
   <button class="delete-btn" title="Delete" onclick="requestDelete('${id}')">🗑️</button>
  </div>`}).join(""):`<div class="empty">Your basket is empty.</div>`;
 const totalInfo=basketTotals();
 $("basketSummary").innerHTML=entries.length?`<div class="basket-summary"><div class="summary-row"><span>Subtotal</span><b>₹${money(totalInfo.subtotal)}</b></div>${totalInfo.discountAmount>0?`<div class="summary-row offer-discount-row"><span>Offer Discount</span><b>-₹${money(totalInfo.discountAmount)}</b></div>`:''}<div class="summary-row"><span>Delivery</span><b>₹0.00</b></div><div class="summary-row grand-total"><span>Total</span><span>₹${money(totalInfo.total)}</span></div>${totalInfo.offer?`<small class="offer-applied">Offer applied: ${escapeHtml(totalInfo.offer.title||'Special offer')}</small>`:''}<button class="primary full" onclick="openCheckout()">Checkout</button></div>`:"";
}
function openBasket(){renderBasket();$("basketDrawer").classList.add("show");$("basketBackdrop").classList.add("show")}
function closeBasket(){$("basketDrawer").classList.remove("show");$("basketBackdrop").classList.remove("show")}

async function openCheckout(){
 if(!currentUser && !guestMode){openAccount();showAuth('login','email');return}
 if(!Object.keys(basket).length){alert("Your basket is empty.");return}
 await Promise.all([loadProfile(),loadAddresses()]);
 if(currentProfile?.full_name)$("customerName").value=currentProfile.full_name;
 if(currentProfile?.phone||currentUser.phone)$("customerPhone").value=currentProfile?.phone||currentUser.phone;
 const def=accountAddresses.find(a=>a.is_default)||accountAddresses[0];if(def&&!$("customerAddress").value)$("customerAddress").value=def.address; const box=$("savedAddressBox"); if(box) box.innerHTML=accountAddresses.length?`<select onchange="useSavedAddress(this.value)"><option value="">Use a saved address...</option>${accountAddresses.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.label||'Address')} — ${escapeHtml(a.address.slice(0,55))}</option>`).join('')}</select>`:'';
 const totals=basketTotals(); const subtotal=totals.subtotal; const offer=totals.offer;
 let lines=Object.entries(basket).map(([id,q],i)=>{const p=productById(id);return `${i+1}. ${p.name} x ${q} — ₹${money(p.price*q)}`}).join("\n");
 if(offer?.gift_product_id){const gp=productById(offer.gift_product_id);if(gp)lines+=`\n🎁 FREE: ${gp.name} x 1 — ₹0.00`; }
 $("orderPreview").textContent=`Order Details\n${lines}\n\nTotal: ₹${money(totals.total)}${totals.discountAmount>0?`\nOffer Discount: -₹${money(totals.discountAmount)}`:``}`;
 $("checkoutModal").classList.add("show");
}
function closeCheckout(){$("checkoutModal").classList.remove("show")}
function useSavedAddress(id){const a=accountAddresses.find(x=>String(x.id)===String(id));if(a){$("customerAddress").value=a.address;$("customerPhone").value=a.phone||currentUser?.phone||$("customerPhone").value}}
async function placeOrder(){
 const name=$("customerName").value.trim(),phone=$("customerPhone").value.trim(),address=$("customerAddress").value.trim();
 if(!currentUser && !guestMode){openAccount();showAuth('login',activeAuthIdentifier);return}
 if(!name||!phone||!address){alert("Please enter your name, phone number and delivery address.");return}
 const totals=basketTotals(); const subtotal=totals.subtotal;
 const items=Object.entries(basket).map(([id,q])=>{const p=productById(id);return {id:p.id,name:p.name,quantity:q,price:Number(p.price),line_total:Number(p.price)*q}});
 const offer=activeOfferForSubtotal(subtotal);
 if(offer?.gift_product_id && !items.some(i=>String(i.id)===String(offer.gift_product_id))){const gp=productById(offer.gift_product_id);if(gp&&productStock(gp)>0)items.push({id:gp.id,name:gp.name,quantity:1,price:0,line_total:0,free_gift:true});}
 const file=$("prescriptionFile")?.files?.[0];
 const order={id:"SP"+Date.now().toString().slice(-8),created_at:new Date().toISOString(),customer:{name,phone,address,notes:$("customerNotes").value.trim()},items,total:Number(totals.total),status:"New",order_user_id:currentUser?.id||null,prescription_path:""};
 try{ if(file)order.prescription_path=await uploadPrescription(file,order.id); }catch(e){alert('Prescription upload failed. '+e.message);return}
 const orders=JSON.parse(localStorage.getItem("sahodaraOrders")||"[]");orders.unshift(order);localStorage.setItem("sahodaraOrders",JSON.stringify(orders));
 try{await supabaseRequestOrders(order);}catch(e){console.error(e);alert("Your order could not be saved online. Please try again.\\n\\n"+(e.message||"Unknown error"));return}
 if(offer?.gift_product_id){const gp=productById(offer.gift_product_id);if(gp){/* free gift recorded in order only */}}
 basket={};saveAll();renderBasket();closeCheckout();
 $("orderSuccessText").textContent=`Thank you, ${name}. Your order #${order.id} has been successfully placed.`;
 $("orderSuccessModal").classList.add("show");
 loadOrderHistory();
}
async function uploadPrescription(file,orderId){
 const ext=(file.name||'pdf').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'pdf';
 const path=`${currentUser.id}/${orderId}-${Date.now()}.${ext}`;
 const r=await fetch(`${STORAGE_ENDPOINT}/prescriptions/${encodeURIComponent(path)}`,{method:'POST',headers:authHeaders({'Content-Type':file.type||'application/octet-stream','x-upsert':'true'}),body:file});
 if(!r.ok){const detail=await r.text(); if(r.status===404 && /bucket|not found/i.test(detail)) throw new Error('Prescription storage bucket is not set up yet. Run prescription-storage-setup.sql in Supabase, then try again.'); throw new Error(detail||`Upload failed (${r.status})`);} return path;
}
async function supabaseRequestOrders(order){
 const payload={id:order.id,customer_name:order.customer.name,customer_phone:order.customer.phone,customer_address:order.customer.address,customer_notes:order.customer.notes,items:order.items,total:order.total,status:order.status,created_at:order.created_at,order_user_id:order.order_user_id,prescription_path:order.prescription_path||null};
 const res=await fetch(`${SUPABASE_URL}/rest/v1/customer_orders`,{
   method:"POST",
   headers:{"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json","Accept":"application/json","Prefer":"return=representation"},
   body:JSON.stringify(payload)
 });
 if(!res.ok){
   let detail=""; try{detail=await res.text()}catch(_){detail=""}
   throw new Error(`Supabase ${res.status}: ${detail||res.statusText}`);
 }
 return res.json().catch(()=>null);
}
async function renderAdminOrders(){
 const el=$("adminOrders"); if(!el)return;
 el.innerHTML='<div class="empty">Loading orders...</div>';
 try{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/customer_orders?select=id,customer_name,customer_phone,customer_address,customer_notes,items,total,status,created_at&order=created_at.desc`,{headers:{"apikey":SUPABASE_ANON_KEY,}});
  if(!res.ok) throw new Error(await res.text());
  const orders=await res.json();
  el.innerHTML=orders.length?orders.map(o=>`<div class="admin-product order-card"><b>Order #${escapeHtml(o.id)}</b><div><b>Customer:</b> ${escapeHtml(o.customer_name)} • ${escapeHtml(o.customer_phone)}</div><div><b>Address:</b> ${escapeHtml(o.customer_address)}</div>${o.customer_notes?`<div><b>Notes:</b> ${escapeHtml(o.customer_notes)}</div>`:""}<div><b>Items:</b> ${Array.isArray(o.items)?o.items.map(i=>`${escapeHtml(i.name)} × ${i.quantity} — ₹${money(i.line_total)}`).join(", "):""}</div><strong>Total: ₹${money(o.total)}</strong><div><b>Status:</b> ${escapeHtml(o.status)}</div><small>${new Date(o.created_at).toLocaleString()}</small></div>`).join(""):'<div class="empty">No orders received yet.</div>';
 }catch(e){
  console.error("Cloud order load failed",e);
  el.innerHTML='<div class="empty">Could not load online orders. Please check the Supabase orders table and RLS setup.</div>';
 }
}

function closeOrderSuccess(){ $("orderSuccessModal").classList.remove("show"); }


let orderRefreshTimer=null;
function startOrderAutoRefresh(){
 if(orderRefreshTimer) clearInterval(orderRefreshTimer);
 orderRefreshTimer=setInterval(()=>{ if(!$('adminPanel')?.classList.contains('hidden')) renderAdminOrders(); },5000);
}

function openAdmin(){$("adminModal").classList.add("show");$("adminLogin").classList.remove("hidden");$("adminPanel").classList.add("hidden")}
function closeAdmin(){$("adminModal").classList.remove("show")}
function loginAdmin(){
 if($("adminId").value===ADMIN_ID&&$("adminPassword").value===ADMIN_PASSWORD){$("adminLogin").classList.add("hidden");$("adminPanel").classList.remove("hidden");renderAdminProducts();renderAdminOrders();startOrderAutoRefresh()}
 else alert("Invalid Admin ID or password.");
}
function logoutAdmin(){openAdmin()}

function chooseGallery(){
  document.getElementById("newImage").click();
}
function takePhoto(){
  document.getElementById("newCamera").click();
}
function syncCameraToNewImage(){
  const camera=document.getElementById("newCamera");
  const gallery=document.getElementById("newImage");
  if(camera.files && camera.files[0]){
    const dt=new DataTransfer();
    dt.items.add(camera.files[0]);
    gallery.files=dt.files;
  }
}
function chooseEditGallery(id){
  document.getElementById("ei"+id).click();
}
function takeEditPhoto(id){
  document.getElementById("ec"+id).click();
}
function syncEditCamera(id){
  const camera=document.getElementById("ec"+id);
  const gallery=document.getElementById("ei"+id);
  if(camera.files && camera.files[0]){
    const dt=new DataTransfer();
    dt.items.add(camera.files[0]);
    gallery.files=dt.files;
  }
}

function previewImage(input,target){
 const file=input.files?.[0];if(!file)return;
 const reader=new FileReader();reader.onload=e=>{$(target).src=e.target.result;$(target).classList.remove("hidden")};reader.readAsDataURL(file);
}
async function addProduct(){
 const name=$("newName").value.trim(),price=Number($("newPrice").value),mrp=Number($("newMrp")?.value),file=$("newImage").files?.[0];
 if(!name||!Number.isFinite(price)||price<0){alert("Enter a product name and valid selling price.");return}
 if(Number.isFinite(mrp)&&mrp>0&&mrp<price){alert("MRP cannot be lower than selling price.");return}
 const productId="c"+Date.now();
 try{
  const image=file?await uploadProductImage(file,productId):"";
  const product={id:productId,name,price,mrp:(Number.isFinite(mrp)&&mrp>0?mrp:price),image};
  await upsertProductCloud(product);customProducts.push(product);saveAll();
  $("newName").value="";if($("newBrand"))$("newBrand").value="";if($("newFormula"))$("newFormula").value="";$("newPrice").value="";if($("newMrp"))$("newMrp").value="";$("newImage").value="";$("newPreview").src="";$("newPreview").classList.add("hidden");
  renderProducts();renderAdminProducts();alert("Product added successfully and synced to all devices.");
 }catch(e){console.error(e);alert("Could not save the product online. Please check your Supabase setup and Storage bucket.")}
}
function renderAdminProducts(){
 const q=$("adminSearch").value.trim().toLowerCase();
 const list=customProducts.filter(p=>{const hay=`${p.name||''} ${p.brand||''} ${p.formula||''}`.toLowerCase();return hay.includes(q)||fuzzyMatch(q,hay)});
 $("adminProductList").innerHTML=list.length?list.map(p=>`
  <div class="admin-product">
   <div class="form-grid"><input id="en${p.id}" value="${escapeHtml(p.name)}" placeholder="Product name"><input id="eb${p.id}" value="${escapeHtml(p.brand||"")}" placeholder="Brand Name (Optional)"><input id="ef${p.id}" value="${escapeHtml(p.formula||"")}" placeholder="Formula"><input id="ep${p.id}" type="number" value="${p.price}" min="0" placeholder="Selling Price (₹)"><input id="em${p.id}" type="number" value="${p.mrp||p.price}" min="0" placeholder="MRP (₹)"></div>
   <label class="upload-label">Product Photo</label>
   <div class="photo-actions"><button type="button" class="secondary" onclick="chooseEditGallery('${p.id}')">Choose from Gallery</button><button type="button" class="secondary" onclick="takeEditPhoto('${p.id}')">Take Photo</button></div>
   <input id="ei${p.id}" class="file-hidden" type="file" accept="image/*">
   <input id="ec${p.id}" class="file-hidden" type="file" accept="image/*" capture="environment" onchange="syncEditCamera('${p.id}')">
   ${p.image?`<img class="image-preview" src="${p.image}" alt="Product photo">`:"<small>No image uploaded.</small>"}
   <div class="admin-product actions"><button class="primary" onclick="editProduct('${p.id}')">Save Changes</button><button class="danger" onclick="deleteProduct('${p.id}')">Delete</button></div>
  </div>`).join(""):`<div class="empty">No matching products.</div>`;
}
async function editProduct(id){
 const p=customProducts.find(x=>x.id===id);if(!p)return;
 const name=$("en"+id).value.trim(),brand=$("eb"+id)?.value.trim()||"",formula=$("ef"+id)?.value.trim()||"",price=Number($("ep"+id).value),mrp=Number($("em"+id).value),file=$("ei"+id).files?.[0];
 if(!name||!Number.isFinite(price)||price<0){alert("Enter a valid product name and selling price.");return}
 if(Number.isFinite(mrp)&&mrp>0&&mrp<price){alert("MRP cannot be lower than selling price.");return}
 try{
  const image=file?await uploadProductImage(file,id):(p.image||"");
  const updated={...p,name,brand,formula,price,mrp:(Number.isFinite(mrp)&&mrp>0?mrp:price),image};
  await upsertProductCloud(updated);Object.assign(p,updated);saveAll();renderProducts();renderRecentlyViewed();renderAdminProducts();alert("Product updated and synced to all devices.");
 }catch(e){console.error(e);alert("Could not update the product online. Please check your Supabase setup and Storage bucket.")}
}
async function deleteProduct(id){
 if(!confirm("Delete this product from the store?"))return;
 try{await deleteProductCloud(id);customProducts=customProducts.filter(p=>p.id!==id);delete basket[id];saveAll();renderProducts();renderBasket();renderAdminProducts();}
 catch(e){console.error(e);alert("Could not delete the product online. Please check your Supabase setup.")}
}

function openSharedProductFromUrl(){
 const productId=new URLSearchParams(window.location.search).get("product");
 if(!productId)return false;
 const p=productById(productId);
 if(!p)return false;
 // Give the page a moment to finish rendering, then open the exact product.
 setTimeout(()=>openProduct(productId),80);
 return true;
}

let adSlides=[];
let adIndex=0;
let adTimer=null;
let adTouchStartX=null;
let adTouchStartY=null;

async function loadAdSlides(){
  try{
    const rows=await fetch(SLIDES_ENDPOINT+'?select=id,image,title,subtitle,link,active,sort_order&active=eq.true&order=sort_order.asc,created_at.asc',{headers:{apikey:SUPABASE_ANON_KEY,Accept:'application/json'}});
    if(!rows.ok)throw new Error(await rows.text());
    adSlides=await rows.json();
    renderAdSlides();
  }catch(e){
    adSlides=[];
    renderAdSlides();
    console.warn('Ad slide load skipped. Run the provided ad-slides SQL setup in Supabase.',e);
  }
}
function adTone(index){
  return ['coral','violet','emerald'][index%3];
}
function renderAdSlides(){
  const section=$("adSection"),track=$("adTrack"),dots=$("adDots");
  if(!section||!track)return;
  if(!adSlides.length){section.classList.add('hidden');track.innerHTML='';if(dots)dots.innerHTML='';stopAdAutoplay();return}
  section.classList.remove('hidden');
  adIndex=Math.max(0,Math.min(adIndex,adSlides.length-1));
  track.innerHTML=adSlides.map((s,i)=>{
    const title=s.title?.trim()||'Festival promotion';
    const href=s.link?escapeHtml(s.link):'javascript:void(0)';
    const disabled=s.link?'':'onclick="return false;"';
    return `<a class="ad-slide ad-tone-${adTone(i)}" href="${href}" ${disabled} data-index="${i}">
      <img src="${escapeHtml(s.image)}" alt="${escapeHtml(title)}" loading="${i===0?'eager':'lazy'}">
      <div class="ad-shade"></div>
      <div class="ad-progress"><span class="ad-progress-fill"></span></div>
    </a>`;
  }).join('');
  track.style.transform=`translateX(-${adIndex*100}%)`;
  if(dots)dots.innerHTML=adSlides.map((_,i)=>`<button class="ad-dot ${i===adIndex?'active':''}" aria-label="Go to slide ${i+1}" onclick="goToAdSlide(${i})"></button>`).join('');
  resetAdProgress();
  startAdAutoplay();
}
function resetAdProgress(){
  const fill=document.querySelector(`.ad-slide:nth-child(${adIndex+1}) .ad-progress-fill`);
  if(!fill)return;
  fill.classList.remove('running');
  void fill.offsetWidth;
  fill.classList.add('running');
}
function goToAdSlide(index){
  if(!adSlides.length)return;
  adIndex=(index+adSlides.length)%adSlides.length;
  const track=$("adTrack");if(track)track.style.transform=`translateX(-${adIndex*100}%)`;
  document.querySelectorAll('.ad-dot').forEach((d,i)=>d.classList.toggle('active',i===adIndex));
  resetAdProgress();
  startAdAutoplay();
}
function changeAdSlide(delta){goToAdSlide(adIndex+delta)}
function startAdAutoplay(){
  stopAdAutoplay();
  if(adSlides.length>1)adTimer=setInterval(()=>goToAdSlide(adIndex+1),3000);
}
function stopAdAutoplay(){if(adTimer){clearInterval(adTimer);adTimer=null}}
function bindAdTouch(){
  const slider=$("adSlider");if(!slider||slider.dataset.bound)return;
  slider.dataset.bound='1';
  slider.addEventListener('touchstart',e=>{const t=e.changedTouches[0];adTouchStartX=t.clientX;adTouchStartY=t.clientY;stopAdAutoplay()},{passive:true});
  slider.addEventListener('touchend',e=>{
    if(adTouchStartX===null)return;
    const t=e.changedTouches[0],dx=t.clientX-adTouchStartX,dy=t.clientY-adTouchStartY;
    adTouchStartX=adTouchStartY=null;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))changeAdSlide(dx<0?1:-1);else startAdAutoplay();
  },{passive:true});
  slider.addEventListener('mouseenter',stopAdAutoplay);
  slider.addEventListener('mouseleave',startAdAutoplay);
}

function clearRecent(){recentlyViewed=[];saveAll();renderRecentlyViewed()}

async function loadOrderHistory(){
 if(!currentUser)return [];
 try{return await authDbRequest(`${SUPABASE_URL}/rest/v1/customer_orders?order_user_id=eq.${encodeURIComponent(currentUser.id)}&select=id,items,total,status,created_at,customer_address,prescription_path&order=created_at.desc&limit=50`)||[]}
 catch(_){return []}
}
function statusSteps(status){const all=['New','Accepted','Preparing','Out for Delivery','Delivered'];const idx=all.indexOf(status);return `<div class="status-timeline">${all.map((s,i)=>`<div class="timeline-step ${i<=idx?'done':''} ${i===idx?'current':''}"><span>${i<idx?'✓':i===idx?'●':'○'}</span><b>${s}</b></div>`).join('')}</div>`}
let customerOrderRefreshTimer=null;
let lastCustomerStatuses={};

function renderOrderHistoryRows(rows){
 const view=$('ordersView');
 if(!view)return;
 view.innerHTML=`<h2>My Orders</h2><p class="muted">Order status updates automatically while this screen is open.</p>${rows.length?rows.map(o=>`<article class="history-card"><div class="history-head"><b>#${escapeHtml(o.id)}</b><span class="status-pill">${escapeHtml(o.status)}</span></div><div class="muted">${new Date(o.created_at).toLocaleString()}</div><div class="history-items">${(o.items||[]).map(i=>`<span>${escapeHtml(i.name)} × ${i.quantity}</span>`).join(' • ')}</div><strong>₹${money(o.total)}</strong>${statusSteps(o.status)}</article>`).join(''):'<div class="empty">No orders yet.</div>'}`;
}

async function refreshCustomerOrderHistory(){
 if(!currentUser || !$('ordersModal')?.classList.contains('show')) return;
 try{
   const rows=await loadOrderHistory();
   for(const row of rows){
     const st=String(row.status||'New');
     if(lastCustomerStatuses[row.id] && lastCustomerStatuses[row.id]!==st){
       try{ if('Notification' in window && Notification.permission==='granted') new Notification('Sahodara Pharmacy — Order Update',{body:`Order ${row.id} is now ${st}.`}); }catch(_){}
     }
     lastCustomerStatuses[row.id]=st;
   }
   renderOrderHistoryRows(rows);
 }catch(e){ console.warn('Could not refresh order status',e); }
}

function startCustomerOrderRefresh(){
 if(customerOrderRefreshTimer)clearInterval(customerOrderRefreshTimer);
 customerOrderRefreshTimer=setInterval(refreshCustomerOrderHistory,3000);
 try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(_){}
}
function stopCustomerOrderRefresh(){ if(customerOrderRefreshTimer){clearInterval(customerOrderRefreshTimer);customerOrderRefreshTimer=null;} }

async function showOrderHistory(){
 if(!currentUser){openAccount();showAuth('login',activeAuthIdentifier);return}
 const view=$('ordersView');$('ordersModal').classList.add('show');view.innerHTML='<h2>My Orders</h2><p class="muted">Loading your order history...</p>';
 lastCustomerStatuses={};
 const rows=await loadOrderHistory();
 rows.forEach(o=>lastCustomerStatuses[o.id]=String(o.status||'New'));
 renderOrderHistoryRows(rows);
 startCustomerOrderRefresh();
}
function closeOrdersModal(){$('ordersModal').classList.remove('show');stopCustomerOrderRefresh()}
async function showWishlist(){
 const view=$('wishlistView');$('wishlistModal').classList.add('show');await loadWishlist();const list=accountWishlist.map(productById).filter(Boolean);
 view.innerHTML=`<h2>My Wishlist</h2>${list.length?`<div class="wishlist-grid">${list.map(p=>`<article class="wishlist-card"><img src="${p.image||'sahodara-logo.jpeg'}" onerror="this.src='sahodara-logo.jpeg'" alt=""><div><b>${escapeHtml(p.name)}</b>${p.brand?`<span class="brand-chip"><span class="brand-chip-text">${escapeHtml(p.brand)}</span></span>`:''}<div class="price">₹${money(p.price)}</div><button class="add-btn" onclick="addToBasket('${p.id}');showWishlist()">Add to Basket</button><button class="text-btn" onclick="toggleWishlist('${p.id}');showWishlist()">Remove</button></div></article>`).join('')}</div>`:'<div class="empty">Your wishlist is empty.</div>'}`
}
function closeWishlist(){$('wishlistModal').classList.remove('show')}
async function enableCustomerNotifications(){const r=await registerPushNotifications();if(r.message)alert(r.message);}
async function sendTestPushNotification(){
 if(!currentUser){alert('Please login to your customer account first.');return;}
 try{
   const res=await fetch('/.netlify/functions/test-push',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({})});
   const data=await res.json().catch(()=>({}));
   if(!res.ok) throw new Error(data.error||'Test notification failed.');
   alert(data.message||'Test notification sent.');
 }catch(e){alert('Test notification error: '+(e.message||e));}
}
async function showNotifications(){
 const view=$('notificationsView');$('notificationsModal').classList.add('show');view.innerHTML='<h2>Notifications</h2><p class="muted">Loading...</p>';const rows=await loadNotifications();
 let html='<h2>Notifications</h2><div class="notification-settings"><p class="muted">Product updates arrive once every hour in rotation. A basket reminder is sent once, about 30 seconds after you leave with an item without placing an order.</p><button class="primary full" onclick="enableCustomerNotifications()">'+(localStorage.getItem('sahodaraPushEnabled')==='1'?'Notifications Enabled':'Enable Notifications')+'</button><button class="secondary full" style="margin-top:8px" onclick="sendTestPushNotification()">Send Test Notification</button></div>';
 html += rows.length ? rows.map(n=>'<div class="notification-card"><b>'+escapeHtml(n.title||'Sahodara Pharmacy')+'</b><p>'+escapeHtml(n.message||'')+'</p><small>'+new Date(n.created_at).toLocaleString()+'</small></div>').join('') : '<div class="empty">No notifications yet.</div>';
 view.innerHTML=html;
}
function closeNotifications(){$('notificationsModal').classList.remove('show')}
function openProfileMenu(){
 const menu=$('profileMenu'), back=$('profileMenuBackdrop'), list=$('profileMenuList');
 if(!menu||!back||!list)return;
 menu.classList.add('show');back.classList.add('show');
 const logged=!!currentUser;
 $('profileMenuTitle').textContent=logged?(currentProfile?.full_name||'My Account'):(guestMode?'Guest Shopping':'Customer Menu');
 $('profileMenuSubtitle').textContent=logged?(currentUser.email||currentUser.phone||'Account'):(guestMode?'Shopping as guest':'Login for your account');
 const items=logged||guestMode ? [
   ['📦','My Orders',()=>{closeProfileMenu();showOrderHistory();}],
   ['♡','Wishlist',()=>{closeProfileMenu();showWishlist();}],
   ['🔔','Notifications',()=>{closeProfileMenu();showNotifications();}],
   ['📍','Saved Address',()=>{closeProfileMenu();openAccount();}],
   ['🛒','My Basket',()=>{closeProfileMenu();openBasket();}],
   ['🚪','Log Out',()=>{clearAuthSession();guestMode=false;localStorage.removeItem('sahodoraGuestMode');closeProfileMenu();renderProducts();renderBasket();}]
 ] : [
   ['🔐','Login / Create Account',()=>{closeProfileMenu();openAccount();}],
   ['👤','Continue as Guest',()=>{closeProfileMenu();continueAsGuest();}],
   ['📦','My Orders',()=>{closeProfileMenu();openAccount();}],
   ['♡','Wishlist',()=>{closeProfileMenu();showWishlist();}],
   ['🔔','Notifications',()=>{closeProfileMenu();showNotifications();}]
 ];
 list.innerHTML=items.map((it,i)=>`<button type="button" class="profile-menu-item ${it[1]==='Log Out'?'logout':''}" style="animation-delay:${i*70}ms"><span class="profile-menu-icon">${it[0]}</span><span>${it[1]}</span></button>`).join('');
 list.querySelectorAll('.profile-menu-item').forEach((btn,i)=>btn.addEventListener('click',items[i][2]));
}
function closeProfileMenu(){ $('profileMenu')?.classList.remove('show'); $('profileMenuBackdrop')?.classList.remove('show'); }

function openAccount(){
 $('accountModal').classList.add('show');
 if(currentUser)renderAccountView();else if(guestMode){$('accountModal').classList.add('show');$('accountView').innerHTML=`<div class="account-header"><div class="avatar">G</div><div><h2>Guest Shopping</h2><p class="muted">You are shopping as a guest.</p></div></div><p class="muted">You can browse, add products and place orders without an account.</p><button class="primary full" onclick="showAuth('login',activeAuthIdentifier)">Login / Create Account</button><button class="danger full" onclick="guestMode=false;localStorage.removeItem('sahodoraGuestMode');closeAccount();renderProducts()">Exit Guest Mode</button>`;}else showAuth('login',activeAuthIdentifier);
}
function closeAccount(){$('accountModal').classList.remove('show')}
function showAuth(mode='login',identifier='email'){activeAuthMode=mode;activeAuthIdentifier=identifier;closeAccount();$('authModal').classList.add('show');renderAuthView();}
function continueAsGuest(){guestMode=true;localStorage.setItem('sahodoraGuestMode','true');closeAuth();closeAccount();renderProducts();renderBasket();alert('Guest shopping enabled. You can shop and place an order without creating an account.');}
function closeAuth(){$('authModal').classList.remove('show')}
function openAccount(){
 $('accountModal').classList.add('show');
 if(currentUser)renderAccountView();else if(guestMode){$('accountModal').classList.add('show');$('accountView').innerHTML=`<div class="account-header"><div class="avatar">G</div><div><h2>Guest Shopping</h2><p class="muted">You are shopping as a guest.</p></div></div><p class="muted">You can browse, add products and place orders without an account.</p><button class="primary full" onclick="showAuth('login',activeAuthIdentifier)">Login / Create Account</button><button class="danger full" onclick="guestMode=false;localStorage.removeItem('sahodoraGuestMode');closeAccount();renderProducts()">Exit Guest Mode</button>`;}else showAuth('login',activeAuthIdentifier);
}
function closeAccount(){$('accountModal').classList.remove('show')}
function showAuth(mode='login',identifier='email'){activeAuthMode=mode;activeAuthIdentifier=identifier;closeAccount();$('authModal').classList.add('show');renderAuthView();}
function continueAsGuest(){guestMode=true;localStorage.setItem('sahodoraGuestMode','true');closeAuth();closeAccount();renderProducts();renderBasket();alert('Guest shopping enabled. You can shop and place an order without creating an account.');}
function closeAuth(){$('authModal').classList.remove('show')}
function renderAuthView(){
 const title=activeAuthMode==='signup'?'Create Customer Account':activeAuthMode==='forgot'?'Forgot Password':'Customer Login';
 $('authView').innerHTML=`<h2>${title}</h2><p class="muted">Use your phone number or Gmail/Email with a password.</p>${activeAuthMode!=='forgot'?`<div class="auth-tabs"><button class="${activeAuthIdentifier==='email'?'active':''}" onclick="showAuth('${activeAuthMode}','email')">Gmail / Email</button><button class="${activeAuthIdentifier==='phone'?'active':''}" onclick="showAuth('${activeAuthMode}','phone')">Phone</button></div>`:''}<form onsubmit="return submitAuth(event)">${activeAuthMode==='signup'?`<input id="authName" placeholder="Full Name" required>`:''}<input id="authIdentifier" ${activeAuthIdentifier==='email'?'type="email"':'type="tel"'} placeholder="${activeAuthIdentifier==='email'?'Gmail / Email':'Phone Number (+91...)'}" required>${activeAuthMode==='forgot'&&activeAuthIdentifier==='email'?`<button class="primary full" type="submit">Send Reset Email</button>`:activeAuthMode==='forgot'?`<button class="primary full" type="submit">Send OTP to Phone</button>`:`<div class="password-wrap"><input id="authPassword" type="password" minlength="6" placeholder="Password (min 6 characters)" autocomplete="current-password" required><button type="button" class="password-toggle" aria-label="Show password" onclick="togglePassword('authPassword',this)">👁</button></div><button class="primary full" type="submit">${activeAuthMode==='signup'?'Create Account':'Login'}</button>`}</form>${activeAuthMode==='login'?`<div class="auth-links"><button class="text-btn" onclick="showAuth('forgot', 'email')">Forgot Password?</button><button class="text-btn" onclick="showAuth('signup',activeAuthIdentifier)">Create Account</button></div>`:activeAuthMode==='signup'?`<div class="auth-links"><button class="text-btn" onclick="showAuth('login',activeAuthIdentifier)">Already have an account? Login</button></div>`:`<div class="auth-links"><button class="text-btn" onclick="showAuth('login',activeAuthIdentifier)">Back to Login</button></div>`}<div id="authMessage" class="auth-message"></div>`
}
async function submitAuth(e){
 e.preventDefault();const id=$('authIdentifier').value.trim();
 const msg=$('authMessage');msg.textContent='Please wait...';
 try{
  if(activeAuthMode==='signup'){const p=$('authPassword').value;const data=await signUpAccount(id,p,$('authName').value.trim());if(data?.session){setAuthSession(data);await saveProfile({full_name:$('authName').value.trim(),phone:data.user?.phone||'',email:data.user?.email||''});msg.textContent='Account created and logged in.';setTimeout(closeAuth,500);setTimeout(()=>registerPushNotifications(),600)}else msg.textContent='Account created. Check your email/SMS verification before logging in.';return false}
  if(activeAuthMode==='forgot'){
    if(activeAuthIdentifier==='email'){await sendEmailRecovery(id);msg.textContent='If the account exists, a password reset email has been sent.'}
    else {await sendPhoneOtp(id);msg.innerHTML=`OTP sent. <input id="otpCode" inputmode="numeric" maxlength="6" placeholder="6-digit OTP"><div class="password-wrap"><input id="newPhonePassword" type="password" minlength="6" placeholder="New password" autocomplete="new-password"><button type="button" class="password-toggle" aria-label="Show password" onclick="togglePassword('newPhonePassword',this)">👁</button></div><button class="primary full" onclick="finishPhoneReset()">Verify OTP & Set Password</button>`}
    return false;
  }
  const data=await signInAccount(id,$('authPassword').value);await Promise.all([loadProfile(),loadAddresses(),loadWishlist()]);msg.textContent='Login successful.';setTimeout(closeAuth,350);renderProducts();renderBasket();setTimeout(()=>registerPushNotifications(),600);
 }catch(err){msg.textContent=err.message||'Authentication failed.'}
 return false;
}
function togglePassword(id,btn){
 const el=$(id);
 if(!el)return;
 const visible=el.type==='text';
 el.type=visible?'password':'text';
 btn.textContent=visible?'👁':'🙈';
 btn.setAttribute('aria-label',visible?'Show password':'Hide password');
}
async function finishPhoneReset(){try{await verifyPhoneOtp($('otpCode').value.trim());await authFetch('/user',{method:'PUT',body:JSON.stringify({password:$('newPhonePassword').value})});$('authMessage').textContent='Password updated. You are logged in.';setTimeout(closeAuth,600)}catch(e){$('authMessage').textContent=e.message||'Could not reset password.'}}
function authOpenReset(){showAuth('reset','email');$('authView').innerHTML=`<h2>Set New Password</h2><p class="muted">Choose a new password for your account.</p><div class="password-wrap"><input id="resetPassword" type="password" minlength="6" placeholder="New password" autocomplete="new-password"><button type="button" class="password-toggle" aria-label="Show password" onclick="togglePassword(\\'resetPassword\\',this)">👁</button></div><div class="password-wrap"><input id="resetPassword2" type="password" minlength="6" placeholder="Confirm password" autocomplete="new-password"><button type="button" class="password-toggle" aria-label="Show password" onclick="togglePassword(\\'resetPassword2\\',this)">👁</button></div><button class="primary full" onclick="finishEmailReset()">Update Password</button><div id="authMessage" class="auth-message"></div>`}
async function finishEmailReset(){const a=$('resetPassword').value,b=$('resetPassword2').value;if(a.length<6||a!==b){$('authMessage').textContent='Passwords must match and be at least 6 characters.';return}try{await authFetch('/user',{method:'PUT',body:JSON.stringify({password:a})});$('authMessage').textContent='Password updated successfully.';history.replaceState({},'',location.pathname+location.search);setTimeout(closeAuth,700)}catch(e){$('authMessage').textContent=e.message||'Could not update password.'}}
function renderAccountView(){
 const p=currentProfile||{};$('accountView').innerHTML=`<div class="account-header"><div class="avatar">${escapeHtml((p.full_name||currentUser.email||currentUser.phone||'U').slice(0,1).toUpperCase())}</div><div><h2>My Account</h2><p class="muted">${escapeHtml(currentUser.email||currentUser.phone||'')}</p></div></div><div class="account-actions-grid"><button onclick="showOrderHistory();closeAccount()">📦 My Orders</button><button onclick="showWishlist();closeAccount()">♡ Wishlist</button><button onclick="showNotifications();closeAccount()">🔔 Notifications</button><button onclick="renderAddressManager()">📍 Saved Addresses</button></div><div id="addressManager"></div><button class="danger full" onclick="clearAuthSession();closeAccount();renderProducts()">Logout</button>`;
 renderAddressManager();
}
async function renderAddressManager(){const box=$('addressManager');if(!box)return;await loadAddresses();box.innerHTML=`<h3>Saved Addresses</h3>${accountAddresses.map(a=>`<div class="address-card"><b>${escapeHtml(a.label||'Address')}</b><div>${escapeHtml(a.address)}</div><small>${escapeHtml(a.phone||'')}</small></div>`).join('')}<button class="secondary full" onclick="addAddressPrompt()">+ Add Address</button>`}
async function addAddressPrompt(){const label=prompt('Address label (Home/Work):','Home');if(label===null)return;const address=prompt('Full delivery address:');if(!address)return;const phone=prompt('Delivery phone number:',currentUser.phone||'');if(!phone)return;try{await saveAddress(label,address,phone,true);renderAddressManager()}catch(e){alert(e.message)}}


renderProducts();renderBasket();renderRecentlyViewed();
bindAdTouch();
loadAdSlides();
// Supports links like: https://your-site.netlify.app/?product=c12345
// If the product is loaded from Supabase a moment later, loadProductsFromCloud()
// calls this again so shared links also work on a fresh device.
openSharedProductFromUrl();
loadProductsFromCloud();
initAuth();
loadOffers();
setInterval(()=>{ if($("adminPanel") && !$("adminPanel").classList.contains("hidden")) renderAdminOrders(); }, 5000);

let customerNotificationTimer=null;
async function pollCustomerNotifications(){
 if(!currentUser)return; try{const rows=await loadNotifications(); const latest=rows?.[0]; if(latest){const seen=localStorage.getItem('sahodaraLastNotification');if(seen&&seen!==String(latest.id)&&Notification?.permission==='granted')new Notification(latest.title||'Sahodara Pharmacy',{body:latest.message||''});localStorage.setItem('sahodaraLastNotification',String(latest.id));}}catch(_){}}
setTimeout(()=>{try{if('Notification' in window && Notification.permission==='default')Notification.requestPermission()}catch(_){}},1500);
customerNotificationTimer=setInterval(pollCustomerNotifications,15000);


restoreProductActivity();

document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') queueAbandonedReminder(); });
window.addEventListener('pagehide',()=>{ queueAbandonedReminder(); });

// Ask once after login for notification permission only when a customer explicitly opens Notifications.

document.addEventListener('click',e=>{if(!e.target.closest('.searchbar-wrap'))$('searchSuggestions')?.classList.add('hidden')});
