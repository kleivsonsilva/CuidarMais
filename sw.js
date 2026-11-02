// Arquivos estáticos em cache; Firebase sempre segue pela rede.
const CACHE='cuidar-pin-free-v5';
const ASSETS=['./','./index.html','./style.css','./script.js','./tailwind-config.js','./firebase-config.js','./firebase-service.js','./cloud-store.mjs','./pin-service.js','./pin-core.mjs','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cuidar-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin) return;
 const local=ASSETS.map(p=>new URL(p,self.registration.scope).href);
 if(!local.includes(url.href)) return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./')));});
