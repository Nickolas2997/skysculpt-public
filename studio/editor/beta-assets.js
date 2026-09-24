import {accessToken,refreshAccessToken} from './account/client.js?v=0.30.1';

// Tokens are supplied only to our same-origin worker through a private port.
// No token, editor source or signed URL is persisted in CacheStorage.
let installed=false;
export async function installPrivateAssets(){
 if(!('serviceWorker' in navigator))throw Error('Studio needs a browser with service workers enabled. Please use a standard Safari, Chrome, Edge or Firefox window.');
 if(!installed){
  navigator.serviceWorker.addEventListener('message',async event=>{
   const source=event.source,port=event.ports?.[0];
   if(event.data?.type!=='SKYSCULPT_ASSET_TOKEN'||!port||!source?.scriptURL)return;
   const script=new URL(source.scriptURL);
   if(script.origin!==location.origin||script.pathname!==new URL('./private-worker.js',import.meta.url).pathname)return;
   try{port.postMessage({token:event.data.refresh?await refreshAccessToken():await accessToken()});}
   catch{port.postMessage({token:null});}
   finally{port.close();}
  });
  installed=true;
 }
 await navigator.serviceWorker.register(new URL('./private-worker.js',import.meta.url),{scope:'./',updateViaCache:'none'});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
  const changed=()=>{if(navigator.serviceWorker.controller){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};
  const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(Error('Studio could not start its private connection. Reload the page.'));},15000);
  navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
 });
}
