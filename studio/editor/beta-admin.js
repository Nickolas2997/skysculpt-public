import {workspaceAPI} from './workspace/api.js?v=0.30.1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function showAdmin(root,panel,signout){
 let status='pending',offset=0,busy=false;
 root.innerHTML=panel(`<div class="eyebrow">SkySculpt private access</div><h1>Access requests</h1><div class="account-links"><a href="./">Open Studio</a><button id="signout">Sign out</button></div><label>Show<select id="filter"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All requests</option></select></label><div id="requests"></div><div class="account-links"><button id="previous">Previous</button><button id="next">Next</button></div><p id="gate-status" role="status" aria-live="polite"></p>`,'admin');
 const message=text=>{root.querySelector('#gate-status').textContent=text;};
 root.querySelector('#signout').onclick=signout;
 function card(detail){
  const r=detail.request??detail,storedAccess=detail.access?.status??r.access_status;
  const expiry=detail.access?.expires_at??r.expires_at;
  const access=storedAccess==='approved'&&expiry&&Date.parse(expiry)<=Date.now()?'expired':storedAccess;
  const buttons=r.status==='pending'?['approve','reject']:r.status==='approved'?(['revoked','expired'].includes(access)?['restore']:['resend','revoke']):[];
  const labels={approve:'Approve and invite',reject:'Reject request',revoke:'Revoke access',restore:'Restore access',resend:'Resend invitation'};
  return `<article class="request-card" data-id="${esc(r.id)}"><h2>${esc(r.full_name)}</h2><p><strong>${esc(r.email)}</strong><br>${esc(r.company)}</p>${r.website?`<p>Website: ${esc(r.website)}</p>`:''}<p class="request-use">${esc(r.intended_use)}</p><p class="help">Request: ${esc(r.status)}${access?' · Access: '+esc(access):''}${r.last_email_event?'<br>Last email event: '+esc(r.last_email_event.replaceAll('_',' ')):''}</p><div class="account-links">${buttons.map(d=>`<button data-decision="${d}" ${d==='approve'?'class="primary"':''}>${labels[d]}</button>`).join('')}</div><div class="decision-confirm" hidden></div></article>`;
 }
 async function load(selected=null){
  message('Loading…');root.querySelector('#requests').replaceChildren();
  try{
   if(selected){const detail=await workspaceAPI('beta-detail',{request_id:selected});root.querySelector('#requests').innerHTML=card(detail);root.querySelector('#previous').disabled=true;root.querySelector('#next').disabled=true;}
   else{const result=await workspaceAPI('beta-list',{status,offset});root.querySelector('#requests').innerHTML=result.requests.map(card).join('')||'<p>No requests in this category.</p>';root.querySelector('#previous').disabled=offset===0;root.querySelector('#next').disabled=offset+result.limit>=result.total;}
   message('');
  }catch(error){message(error.message);}
 }
 root.querySelector('#filter').onchange=e=>{if(busy)return;status=e.target.value;offset=0;load();};
 root.querySelector('#previous').onclick=()=>{if(!busy){offset=Math.max(0,offset-25);load();}};
 root.querySelector('#next').onclick=()=>{if(!busy){offset+=25;load();}};
 root.querySelector('#requests').onclick=async event=>{
  const button=event.target.closest('button[data-decision]');if(!button||busy)return;
  const article=button.closest('[data-id]'),request_id=article.dataset.id,decision=button.dataset.decision;
  const confirmation=article.querySelector('.decision-confirm');
  confirmation.hidden=false;
  const descriptions={approve:'Approve this person and email their personal invitation?',reject:'Reject this access request?',revoke:'Remove this person’s access to Studio?',restore:'Restore this person’s Studio access?',resend:'Send a new invitation link? Previous unused links may stop working.'};
  confirmation.innerHTML=`<p>${descriptions[decision]}</p><button class="primary" id="confirm-action">Confirm</button> <button id="cancel-action">Cancel</button>`;
  confirmation.querySelector('#cancel-action').onclick=()=>{confirmation.hidden=true;};
  confirmation.querySelector('#confirm-action').onclick=async()=>{
   if(busy)return;busy=true;root.querySelectorAll('button,select').forEach(el=>el.disabled=true);message('Saving…');
   try{const result=await workspaceAPI('beta-review',{request_id,decision});await load(request_id);message(result.message||({reject:'Request rejected.',revoke:'Access revoked.',restore:'Access restored. Use Resend invitation if needed.'}[decision]??'Saved.'));}
   catch(error){message(error.message);}
   finally{busy=false;root.querySelectorAll('button,select').forEach(el=>el.disabled=false);root.querySelector('#previous').disabled=true;root.querySelector('#next').disabled=true;}
  };
 };
 const selected=new URLSearchParams(location.search).get('request');
 await load(selected&&/^[0-9a-f-]{36}$/i.test(selected)?selected:null);
}
