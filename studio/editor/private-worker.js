/* SkySculpt private asset transport. Public gate files are the only network fallback.
 * Reconstructed responses preserve the original same-origin base URL for module
 * imports, CSS fonts and workers. Editor code is never saved to an offline cache.
 */
const BUILD='beta-031-fd38999032952ca3';
const API='https://vz58nljdjj.execute-api.eu-north-1.amazonaws.com/default/imagetomesh?studio=1&action=editor-asset';
const PUBLIC=new Set(['','index.html','entry.js','gate.css','beta-assets.js','private-worker.js','beta-admin.js',
 'studio-config.js','account/client.js','account/messages.js','workspace/api.js',
 'vendor/supabase-auth-2.117.1.js','vendor/SUPABASE-AUTH-LICENSE.txt']);
const BASE=new URL('./',self.location.href);
const SIGNING_CONCURRENCY=2;
const SIGNING_ATTEMPTS=4;
const TRANSIENT_STATUS=new Set([429,500,502,503,504]);
const METADATA_BATCH_LIMIT=32;
const METADATA_BATCH_MS=12;
let signingActive=0;
const signingQueue=[];
const metadataQueues=new Map();
async function withSigningSlot(task){
 if(signingActive>=SIGNING_CONCURRENCY)await new Promise(resolve=>signingQueue.push(resolve));
 else signingActive++;
 try{return await task();}
 finally{
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
function validMetadata(meta){return !!meta&&typeof meta.url==='string'&&typeof meta.type==='string'&&typeof meta.sha256==='string';}
function normalizeMetadata(paths,data){
 const assets={};
 if(paths.length===1&&validMetadata(data)){assets[paths[0]]=data;return {ok:true,status:200,assets};}
 if(data?.build!==BUILD||!data.assets||typeof data.assets!=='object')return {ok:false,status:502};
 for(const path of paths){const meta=data.assets[path];if(!validMetadata(meta))return {ok:false,status:502};assets[path]=meta;}
 return {ok:true,status:200,assets};
}
async function responseCode(response){try{const data=await response.clone().json();return data?.code||data?.errorCode||data?.error_code||null;}catch{return null;}}
async function signedResponse(event,payload){
 const request=async token=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),35000);
  try{return await fetch(API,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({...payload,build:BUILD})});}
  finally{clearTimeout(timer);}
 };
 let refreshed=false;
 for(let attempt=0;attempt<SIGNING_ATTEMPTS;attempt++){
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
   if(attempt===SIGNING_ATTEMPTS-1)throw error;
   response=undefined;
  }
  if(response&&(!TRANSIENT_STATUS.has(response.status)||attempt===SIGNING_ATTEMPTS-1))return response;
  if(response?.body)await response.body.cancel();
  await new Promise(resolve=>setTimeout(resolve,750*2**attempt+Math.random()*250));
 }
}
async function requestMetadata(event,paths){
 const payload=paths.length===1?{path:paths[0]}:{paths};
 const response=await withSigningSlot(()=>signedResponse(event,payload));
 if(response.ok){
  try{return normalizeMetadata(paths,await response.json());}
  catch{return {ok:false,status:502};}
 }
 if(paths.length>1&&response.status===404&&(await responseCode(response))==='NOT_FOUND'){
  const assets={};
  for(const path of paths){
   const single=await requestMetadata(event,[path]);
   if(!single.ok)return single;
   assets[path]=single.assets[path];
  }
  return {ok:true,status:200,assets};
 }
 return {ok:false,status:response.status};
}
function uniquePending(queue){const seen=new Set();for(const entry of queue.entries)seen.add(entry.path);return seen.size;}
function takeMetadataBatch(queue){
 const selected=[],remaining=[],seen=new Set();
 for(const entry of queue.entries){
  if(seen.has(entry.path)||seen.size<METADATA_BATCH_LIMIT){selected.push(entry);seen.add(entry.path);}
  else remaining.push(entry);
 }
 queue.entries=remaining;
 return selected;
}
function scheduleMetadataFlush(key,queue,delay=METADATA_BATCH_MS){
 if(queue.timer!==null)return;
 queue.timer=setTimeout(()=>flushMetadataQueue(key),delay);
}
async function flushMetadataQueue(key){
 const queue=metadataQueues.get(key);if(!queue||queue.flushing)return;
 if(queue.timer!==null){clearTimeout(queue.timer);queue.timer=null;}
 const entries=takeMetadataBatch(queue);
 if(!entries.length){metadataQueues.delete(key);return;}
 queue.flushing=true;
 const paths=[...new Set(entries.map(entry=>entry.path))];
 const context={clientId:entries[0].clientId};
 try{
  const result=await requestMetadata(context,paths);
  for(const entry of entries)entry.resolve(result.ok?{ok:true,meta:result.assets[entry.path]}:{ok:false,status:result.status});
 }catch{
  for(const entry of entries)entry.resolve({ok:false,status:503});
 }finally{
  queue.flushing=false;
  if(queue.entries.length)scheduleMetadataFlush(key,queue,0);
  else metadataQueues.delete(key);
 }
}
function queuedMetadata(event,path){return new Promise(resolve=>{
 const key=event.clientId||'window';
 let queue=metadataQueues.get(key);
 if(!queue){queue={entries:[],timer:null,flushing:false};metadataQueues.set(key,queue);}
 queue.entries.push({clientId:event.clientId,path,resolve});
 if(queue.flushing)return;
 if(uniquePending(queue)>=METADATA_BATCH_LIMIT){if(queue.timer!==null){clearTimeout(queue.timer);queue.timer=null;}flushMetadataQueue(key);}
 else scheduleMetadataFlush(key,queue);
});}
async function asset(event,path){
 try{
  if(event.request.method!=='GET')return denied('Method not allowed',405);
  const signed=await queuedMetadata(event,path);
  if(!signed.ok)return denied('Studio access is required or the editor needs reloading.',signed.status);
  const meta=signed.meta,url=new URL(meta.url);
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
