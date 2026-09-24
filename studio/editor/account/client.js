import {AuthClient} from '../vendor/supabase-auth-2.117.1.js';
import {studioConfig} from '../studio-config.js?v=0.30.1';

// Isolated from scene storage and exports. The SDK renews the signed-in session.
const memory=new Map();
const storage={getItem(key){try{return localStorage.getItem(key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},
 setItem(key,value){memory.set(key,value);try{localStorage.setItem(key,value);}catch{}},
 removeItem(key){memory.delete(key);try{localStorage.removeItem(key);}catch{}}};
export const auth=new AuthClient({url:studioConfig.supabaseURL+'/auth/v1',headers:{apikey:studioConfig.supabasePublishableKey},
 storageKey:'skysculpt-studio-account-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storage});
let user=null,recovery=false;
const listeners=new Set();
auth.onAuthStateChange((event,session)=>{
 user=session?.user??null;
 if(event==='PASSWORD_RECOVERY')recovery=true;
 setTimeout(()=>{for(const listener of listeners)listener({user,event,recovery});},0);
});
export const currentUser=()=>user;
export const onAccountChange=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const isPasswordRecovery=()=>recovery;
export const finishPasswordRecovery=()=>{recovery=false;};
export async function accessToken(){
 const {data,error}=await auth.getSession();
 if(error||!data.session?.access_token)throw Object.assign(Error('Sign in to your SkySculpt account to use AI.'),{code:'LOGIN_REQUIRED',status:401});
 return data.session.access_token;
}
export async function refreshAccessToken(){const {data,error}=await auth.refreshSession();if(error||!data.session)throw Object.assign(Error('Your session has expired. Please sign in again.'),{code:'LOGIN_REQUIRED',status:401});return data.session.access_token;}
export const redirectURL=()=>new URL('./',location.href).href.split('#')[0].split('?')[0];
