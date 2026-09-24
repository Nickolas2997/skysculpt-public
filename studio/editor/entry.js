import {auth,onAccountChange,redirectURL,isPasswordRecovery,finishPasswordRecovery} from './account/client.js?v=0.30.1';
import {workspaceAPI} from './workspace/api.js?v=0.30.1';
import {authMessage} from './account/messages.js?v=0.30.1';
import {studioConfig} from './studio-config.js?v=0.30.1';
import {installPrivateAssets} from './beta-assets.js';
const root=document.querySelector('#app');
const params=new URLSearchParams(location.search);
let invite=params.get('invite_token'),inviteType=params.get('type'),needsPassword=false;
if(invite){params.delete('invite_token');params.delete('type');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
const adminView=params.get('admin')==='1';
let mode=params.get('requestAccess')==='1'?'request':'signin',starting=false,startedId=null,busy=false,email='',blocked=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panel=(body,extra='')=>`<main class="studio-gate ${extra}"><a class="gate-brand" href="../../">SkySculpt <span>Studio</span></a><section>${body}<small class="gate-version">Private preview · WEB 0.31</small></section></main>`;
const status=message=>{const el=root.querySelector('#gate-status');if(el)el.textContent=message;};
async function signout(){const {error}=await auth.signOut({scope:'local'});if(error){status(authMessage(error));return;}location.href='./';}
function gate(message=''){
 const request=mode==='request',reset=mode==='reset';
 root.innerHTML=panel(`<div class="eyebrow">Private access</div><h1>${request?'Request Studio access':reset?'Reset your password':adminView?'Sign in to manage access':'Welcome to SkySculpt Studio'}</h1>${request?'<p>Tell us about your work. We review each request and send a personal invitation when access is approved.</p>':reset?'':'<p>Studio is currently available to approved designers. Sign in with the email on your invitation.</p>'}<form id="gate-form">${request?'<label>Full name<input name="full_name" autocomplete="name" maxlength="120" required></label>':''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" value="${esc(email)}" required></label>${request?'<label>Company or independent designer<input name="company" autocomplete="organization" maxlength="160" placeholder="Company name or Independent designer" required></label><label>Website or portfolio <span class="help">Optional</span><input name="website" type="url" maxlength="500" placeholder="https://"></label><label>How would you use SkySculpt?<textarea name="intended_use" maxlength="2000" required></textarea></label><label class="honeypot" aria-hidden="true">Fax<input name="contact_fax" tabindex="-1" autocomplete="off"></label><p class="help">We use these details to review your request and contact you about access.</p>':reset?'':'<label>Password<input name="password" type="password" autocomplete="current-password" required></label>'}<button class="primary" type="submit">${request?'Request access':reset?'Send reset link':'Sign in'}</button></form><div class="account-links"><button id="gate-mode">${mode==='signin'?'Request access':'Back to sign in'}</button>${mode==='signin'?'<button id="gate-reset">Forgot password?</button>':''}</div><p role="status" aria-live="polite" id="gate-status">${esc(message)}</p>`);
 root.querySelector('#gate-mode').onclick=()=>{if(!busy){mode=mode==='signin'?'request':'signin';gate();}};
 root.querySelector('#gate-reset')?.addEventListener('click',()=>{if(!busy){mode='reset';gate();}});
 root.querySelector('[name=email]').oninput=e=>{email=e.target.value;};
 root.querySelector('#gate-form').onsubmit=submit;
}
async function submit(event){
 event.preventDefault();if(busy)return;busy=true;
 const form=event.currentTarget,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]'),submittedMode=mode;
 email=data.email.trim();button.disabled=true;status('Please wait…');
 try{
  if(submittedMode==='request'){
   const url=new URL(studioConfig.awsAIEndpoint);url.searchParams.set('studio','1');url.searchParams.set('action','beta-request');
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',body:JSON.stringify({...data,email})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to submit your request.');
   root.innerHTML=panel(`<h1>Request received</h1><p>If your request is approved, you’ll receive a personal invitation by email. Please check your spam folder too.</p><a href="./">Back to sign in</a>`);return;
  }
  const result=submittedMode==='reset'?await auth.resetPasswordForEmail(email,{redirectTo:redirectURL()}):await auth.signInWithPassword({email,password:data.password});
  if(result.error)throw result.error;
  if(submittedMode==='reset')status('If this email has an account, you’ll receive a password reset link.');
  else await start();
 }catch(error){status(authMessage(error));}
 finally{busy=false;if(button.isConnected)button.disabled=false;const input=form.querySelector('[name=password]');if(input)input.value='';}
}
function passwordGate(){
 root.innerHTML=panel('<h1>Set your Studio password</h1><p>Choose a password for future sign-ins.</p><form id="password-form"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="8" required></label><button class="primary">Save password</button></form><p id="gate-status" role="status" aria-live="polite"></p>');
 root.querySelector('#password-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;const form=event.currentTarget,data=new FormData(form);
  if(data.get('password')!==data.get('confirmation')){status('Passwords do not match.');return;}
  busy=true;form.querySelector('button').disabled=true;
  try{const {error}=await auth.updateUser({password:data.get('password')});if(error)throw error;needsPassword=false;finishPasswordRecovery();await start();}
  catch(error){status(authMessage(error));}
  finally{busy=false;if(form.isConnected)form.querySelector('button').disabled=false;}
 };
}
function invitationGate(){
 root.innerHTML=panel('<h1>Your SkySculpt invitation</h1><p>Continue to verify your email and set your password.</p><button id="accept" class="primary">Continue with invitation</button><p id="gate-status" role="status" aria-live="polite"></p>');
 root.querySelector('#accept').onclick=async event=>{
  if(busy)return;busy=true;event.target.disabled=true;needsPassword=true;
  try{
   if(!['invite','recovery'].includes(inviteType)||!/^[A-Za-z0-9_-]{20,512}$/.test(invite))throw Error('This invitation is invalid. Ask SkySculpt for a new invitation.');
   const {error}=await auth.verifyOtp({token_hash:invite,type:inviteType});if(error)throw error;
   invite=null;await start();
  }catch(error){status(authMessage(error)+' If the link has expired, contact info@skysculptai.com for a new invitation.');needsPassword=false;}
  finally{busy=false;if(event.target.isConnected)event.target.disabled=false;}
 };
}
function unavailable(error){
 blocked=true;
 root.innerHTML=panel(`<h1>${error.code==='BETA_ACCESS_REQUIRED'?'Access awaiting approval':'Unable to open Studio'}</h1><p>${esc(error.message)}</p><p id="gate-status" role="status"></p><div class="account-links"><button id="retry" class="primary">Retry</button><button id="signout">Sign out</button><a href="./?requestAccess=1">Request access</a></div>`);
 root.querySelector('#retry').onclick=()=>{blocked=false;start();};root.querySelector('#signout').onclick=signout;
}
const loadStyle=href=>new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=()=>reject(Error('Private editor styles could not load. Please reload.'));document.head.append(link);});
async function start(){
 if(starting||startedId)return;starting=true;
 try{
  if(invite){invitationGate();return;}
  const {data,error}=await auth.getSession();if(error)throw error;const session=data.session;
  if(!session){gate();return;}
  if(needsPassword||isPasswordRecovery()){passwordGate();return;}
  if(mode==='request'&&!adminView){gate();return;}
  root.innerHTML=panel('<h1>Checking your access…</h1>');
  const access=await workspaceAPI('beta-status');
  if(access.user?.id!==session.user.id)throw Error('The account could not be verified.');
  if(adminView){
   if(!access.admin)throw Object.assign(Error('This page requires the SkySculpt administrator account.'),{code:'ADMIN_REQUIRED'});
   const {showAdmin}=await import('./beta-admin.js');await showAdmin(root,panel,signout);startedId=session.user.id;return;
  }
  if(!access.approved)throw Object.assign(Error('Your account does not currently have Studio access. SkySculpt must approve access before you can enter.'),{code:'BETA_ACCESS_REQUIRED'});
  const verified=await workspaceAPI('session');
  if(verified.user?.id!==session.user.id||verified.privateBeta!==true)throw Error('Private access has not been enabled on the server.');
  await installPrivateAssets();
  await Promise.all([loadStyle('./style.css?v=0.31'),loadStyle('./skysculpt.css?v=0.31')]);
  const latest=await auth.getSession();if(latest.data.session?.user.id!==session.user.id){location.reload();return;}
  await import('./app.js?v=0.30.1');
  document.querySelector('link[href^="./gate.css"]')?.remove();
  startedId=session.user.id;blocked=false;
  if(access.admin){const link=document.createElement('a');link.href='./?admin=1';link.textContent='Manage access';link.style.cssText='position:fixed;right:16px;bottom:12px;z-index:10000;padding:7px 12px;background:#1a2028;border:1px solid #52606c;border-radius:8px;font:13px system-ui;color:#d6f97a';document.body.append(link);}
  // Revocation also closes an already open editor. Every protected API request
  // independently checks approval; this timer is only a UI convenience.
  let checking=false;
  const recheck=async()=>{if(checking)return;checking=true;try{const result=await workspaceAPI('beta-status');if(!result.approved||result.user?.id!==startedId)location.reload();}catch{location.reload();}finally{checking=false;}};
  setInterval(recheck,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck();});
 }catch(error){unavailable(error);}
 finally{starting=false;}
}
onAccountChange(({user,event})=>{
 if(startedId&&user?.id!==startedId){root.replaceChildren();location.reload();return;}
 if(user&&!startedId&&!starting&&!busy&&!blocked&&['SIGNED_IN','INITIAL_SESSION','PASSWORD_RECOVERY'].includes(event))start();
});
await start();
