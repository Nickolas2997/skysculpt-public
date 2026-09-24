import {studioConfig} from '../studio-config.js?v=0.30.1';
import {accessToken,refreshAccessToken} from '../account/client.js?v=0.30.1';
export async function workspaceAPI(action,data={}){
 const url=new URL(studioConfig.awsAIEndpoint);url.searchParams.set('studio','1');url.searchParams.set('action',action);
 let token=await accessToken();
 const send=()=>fetch(url,{method:action==='session'?'GET':'POST',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:action==='session'?undefined:JSON.stringify(data)});
 let response=await send();if(response.status===401){token=await refreshAccessToken();response=await send();}
 let result;try{result=await response.json();}catch{throw Error('The Studio server needs the WEB 0.30 update.');}
 if(!response.ok)throw Object.assign(Error(result.error||'Unable to connect to your workspace.'),{code:result.code,status:response.status});return result;
}
export function privateObjectURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!/^skysculpt-studio-library-[0-9]{12}-eu-north-1\.s3(?:\.eu-north-1)?\.amazonaws\.com$/.test(u.hostname))throw Error('Invalid storage URL.');return u.href;}
