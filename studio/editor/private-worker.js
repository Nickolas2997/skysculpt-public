/* SkySculpt private asset transport. Public gate files are the only network fallback.
 * Reconstructed responses preserve the original same-origin base URL for module
 * imports, CSS fonts and workers. Editor code is never saved to an offline cache.
 */
const BUILD='beta-031-9c4a290c813fdfff';
const API='https://vz58nljdjj.execute-api.eu-north-1.amazonaws.com/default/imagetomesh?studio=1&action=editor-asset';
const PUBLIC=new Set(['','index.html','entry.js','gate.css','beta-assets.js','private-worker.js','beta-admin.js',
 'studio-config.js','account/client.js','account/messages.js','workspace/api.js',
 'vendor/supabase-auth-2.117.1.js','vendor/SUPABASE-AUTH-LICENSE.txt']);
const BASE=new URL('./',self.location.href);
// Transport fix 2026-09-24: a module graph must not fan out into dozens of
// concurrent Lambda invocations. This queue is shared by this worker's tabs.
const SIGNING_CONCURRENCY=2;
const SIGNING_ATTEMPTS=4;
const TRANSIENT_STATUS=new Set([429,500,502,503,504]);
let signingActive=0;
const signingQueue=[];
async function withSigningSlot(task){
 if(signingActive>=SIGNING_CONCURRENCY)await new Promise(resolve=>signingQueue.push(resolve));
 else signingActive++;
 try{return await task();}
 finally{
  // Hand the occupied slot directly to the oldest waiter; new requests must
  // not overtake it between promise resolution and continuation.
  const next=signingQueue.shift();if(next)next();else signingActive--;
 }
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function tokenFrom(client,refresh){return new Promise(resolve=>{
 const channel=new MessageChannel();
 const timer=setTimeout(()=>{channel.port1.close();resolve(null);},5000);
 channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(typeof event.data?.token==='string'?event.data.token:null);};
 client.postMessage({type:'SKYSCULPT_ASSET_TOKEN',refresh},[channel.port2]);
});}
async function getToken(clientId,refresh=false){
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const candidates=windows.filter(c=>new URL(c.url).origin===BASE.origin&&new URL(c.url).pathname.startsWith(BASE.pathname));
 candidates.sort((a,b)=>(b.id===clientId)-(a.id===clientId));
 for(const client of candidates){const token=await tokenFrom(client,refresh);if(token)return token;}
 return null;
}
const denied=(message,status=403)=>new Response(message,{status,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
async function signedMetadata(event,path){
 const request=async token=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),35000);
  try{return await fetch(API,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({path,build:BUILD})});}
  finally{clearTimeout(timer);}
 };
 let refreshed=false;
 for(let attempt=0;attempt<SIGNING_ATTEMPTS;attempt++){
  // Acquire a current token after waiting for a slot and again after backoff.
  // Queued requests must not retain a token from before sign-out.
  let token=await getToken(event.clientId);if(!token)return denied('Sign in to Studio',401);
  let response;
  try{
   response=await request(token);
   if(response.status===401&&!refreshed){
    refreshed=true;
    if(response.body)await response.body.cancel();
    token=await getToken(event.clientId,true);if(!token)return denied('Session expired',401);
    response=await request(token);
   }
  }catch(error){
   // A failed CORS preflight is exposed to the worker as a network error.
   if(attempt===SIGNING_ATTEMPTS-1)throw error;
   response=undefined;
  }
  if(response&&(!TRANSIENT_STATUS.has(response.status)||attempt===SIGNING_ATTEMPTS-1))return response;
  if(response?.body)await response.body.cancel();
  // Keep the slot during backoff so retries cannot create a second burst.
  await new Promise(resolve=>setTimeout(resolve,750*2**attempt+Math.random()*250));
 }
}
async function asset(event,path){
 try{
  if(event.request.method!=='GET')return denied('Method not allowed',405);
  const response=await withSigningSlot(()=>signedMetadata(event,path));
  if(!response.ok)return denied('Studio access is required or the editor needs reloading.',response.status);
  const meta=await response.json(),url=new URL(meta.url);
  if(url.protocol!=='https:'||url.username||url.password||url.hostname!=='skysculpt-studio-library-207208119139-eu-north-1.s3.eu-north-1.amazonaws.com')return denied('Invalid asset storage',502);
  const object=await fetch(url,{mode:'cors',credentials:'omit',redirect:'error',cache:'no-store'});
  if(!object.ok)return denied('Unable to load editor asset',502);
  const bytes=await object.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==meta.sha256)return denied('Editor asset integrity check failed',502);
  return new Response(bytes,{headers:{'Content-Type':meta.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return denied('Private editor connection unavailable',503);}
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 let path;try{path=decodeURIComponent(url.pathname.slice(BASE.pathname.length));}catch{event.respondWith(denied('Invalid path',400));return;}
 if(PUBLIC.has(path))return;
 event.respondWith(asset(event,path));
});
